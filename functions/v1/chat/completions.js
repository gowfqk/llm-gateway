/**
 * POST /v1/chat/completions — OpenAI 兼容的 Chat Completions 端点
 * 
 * 支持流式和非流式响应，根据路由规则自动选择供应商
 * 认证：Bearer <gateway_api_key>
 */
import {
  corsHeaders, jsonResponse, errorResponse,
  validateApiKey, getProviders, getRoutes,
  resolveProvider, resolveProviderCandidates, resolveModelAlias, isModelAllowed,
  buildUpstreamUrl, buildUpstreamHeaders,
  buildUpstreamBody, convertAnthropicResponse, convertGoogleResponse, convertCohereResponse,
  handleStreamRequest, logUsage, gatewayFetch, generateRequestId,
} from "../_lib.js";

export async function onRequestPost(context) {
  // --- 生成请求 ID ---
  const incomingRequestId = context.request.headers.get("x-request-id");
  const requestId = incomingRequestId || generateRequestId();
  const requestIdHeaders = { "x-request-id": requestId };

  // --- 认证 ---
  const authResult = await validateApiKey(context.request, context.env);
  if (!authResult.isValid) {
    return errorResponse("Invalid API key. Provide a valid Bearer token in Authorization header.", 401, requestIdHeaders);
  }
  const { userId } = authResult;

  try {
    const body = await context.request.json();
    const model = body.model;
    if (!model) {
      return errorResponse("Missing required parameter: 'model'", 400, requestIdHeaders);
    }

    // --- 加载供应商和路由配置 ---
    const [providers, routes] = await Promise.all([
      getProviders(context.env),
      getRoutes(context.env),
    ]);

    if (!providers || providers.length === 0) {
      return errorResponse("No providers configured. Please add providers in the dashboard.", 503, requestIdHeaders);
    }

    // --- 模型别名解析 ---
    let resolvedModel = model;
    let pinnedProvider = null;
    const aliasResult = resolveModelAlias(model, providers);
    if (aliasResult) {
      resolvedModel = aliasResult.actualModel;
      pinnedProvider = aliasResult.pinnedProvider || null;
      if (pinnedProvider) {
        console.log(`[alias] "${model}" → "${pinnedProvider.name}/${resolvedModel}" (pinned provider)`);
      } else {
        console.log(`[alias] "${model}" → "${resolvedModel}" (via ${aliasResult.provider.name})`);
      }
    }

    // --- 模型权限检查 ---
    // allowedModels 为 null 时表示无限制；否则检查原始模型名和解析后的模型名
    const { allowedModels } = authResult;
    if (allowedModels && !isModelAllowed(model, allowedModels) && !isModelAllowed(resolvedModel, allowedModels)) {
      return errorResponse(
        `Model '${model}' is not allowed for this API key. Allowed models: ${allowedModels.join(", ")}`,
        403,
        requestIdHeaders
      );
    }

    // --- 路由匹配（含 fallback 候选列表） ---
    // 如果别名指定了供应商（pinnedProvider），则直接使用该供应商，跳过路由匹配
    let candidates;
    if (pinnedProvider) {
      candidates = [pinnedProvider];
    } else {
      candidates = resolveProviderCandidates(resolvedModel, providers, routes);
    }
    if (!candidates || candidates.length === 0) {
      return errorResponse(`Model '${model}' not found. Available models: /v1/models`, 404, requestIdHeaders);
    }

    // --- 构建上游请求 ---
    const isStream = body.stream === true;

    // --- 流式响应（支持 fallback：依次尝试候选供应商） ---
    if (isStream) {
      const maxStreamRetries = Math.min(candidates.length, 3);
      let streamLastError = null;

      for (let attempt = 0; attempt < maxStreamRetries; attempt++) {
        const provider = candidates[attempt];
        const upstreamUrl = buildUpstreamUrl(provider, resolvedModel);
        const upstreamHeaders = { ...buildUpstreamHeaders(provider, resolvedModel), "x-request-id": requestId };
        const upstreamBody = buildUpstreamBody(provider, resolvedModel, body);
        const startTime = Date.now();

        try {
          const streamResp = await handleStreamRequest(upstreamUrl, upstreamHeaders, upstreamBody, provider.type, resolvedModel);
          
          // 流式成功 — 延迟记录 usage（等待流结束后从 _streamUsage 获取 token 统计）
          const streamUsage = streamResp._streamUsage;
          const streamStartTime = startTime;
          context.waitUntil((async () => {
            // 等待一段时间让流传输完成，然后记录 usage
            // _streamUsage 对象会在流传输过程中被实时更新
            await new Promise(r => setTimeout(r, 30000)); // 等 30s 让流传完
            await logUsage(context.env, {
              id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              userId,
              providerId: provider.id,
              providerName: provider.name,
              model: resolvedModel,
              promptTokens: streamUsage?.prompt_tokens || 0,
              completionTokens: streamUsage?.completion_tokens || 0,
              totalTokens: streamUsage?.total_tokens || 0,
              timestamp: new Date().toISOString(),
              status: "success",
              latency: Date.now() - streamStartTime,
            });
          })());

          return streamResp;
        } catch (streamErr) {
          const latency = Date.now() - startTime;
          streamLastError = { message: streamErr.message || "Stream error", status: 502, provider };
          console.warn(`[fallback/stream] ${provider.name} failed: ${streamLastError.message}, trying next...`);

          // 记录失败
          context.waitUntil(logUsage(context.env, {
            id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            userId,
            providerId: provider.id,
            providerName: provider.name,
            model: resolvedModel,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            timestamp: new Date().toISOString(),
            status: "error",
            latency,
          }));
          continue;
        }
      }

      // 所有流式候选都失败
      const finalStreamMsg = streamLastError?.message || "All providers failed (stream)";
      return errorResponse(`流式请求所有供应商均失败 (最后错误: ${finalStreamMsg})`, 502, requestIdHeaders);
    }

    // --- 非流式请求（支持 fallback 重试） ---
    let lastError = null;
    const maxRetries = Math.min(candidates.length, 3); // 最多尝试 3 个供应商

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const provider = candidates[attempt];
      const upstreamUrl = buildUpstreamUrl(provider, resolvedModel);
      const upstreamHeaders = { ...buildUpstreamHeaders(provider, resolvedModel), "x-request-id": requestId };
      const upstreamBody = buildUpstreamBody(provider, resolvedModel, body);

      const startTime = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 分钟超时

      let upstreamResp;
      try {
        upstreamResp = await gatewayFetch(upstreamUrl, {
          method: "POST",
          headers: upstreamHeaders,
          body: JSON.stringify(upstreamBody),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timeout);
        // 网络错误或超时 → 尝试下一个供应商
        lastError = { message: fetchErr.message || "Network error", status: 502, provider };
        console.warn(`[fallback] ${provider.name} failed (network): ${lastError.message}, trying next...`);
        continue;
      } finally {
        clearTimeout(timeout);
      }

      const latency = Date.now() - startTime;
      const respData = await upstreamResp.json().catch(() => null);

      // 5xx / 429 → 尝试 fallback
      if (upstreamResp.status >= 500 || upstreamResp.status === 429) {
        const errMsg = respData?.error?.message || respData?.error || `上游返回 ${upstreamResp.status}`;
        lastError = { message: errMsg, status: upstreamResp.status, provider };
        console.warn(`[fallback] ${provider.name} returned ${upstreamResp.status}: ${errMsg}, trying next...`);

        // 记录失败（不阻塞）
        context.waitUntil(logUsage(context.env, {
          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userId,
          providerId: provider.id,
          providerName: provider.name,
          model: resolvedModel,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          timestamp: new Date().toISOString(),
          status: "error",
          latency,
        }));
        continue;
      }

      // 4xx（非 429）→ 不重试，客户端错误直接返回
      if (!upstreamResp.ok) {
        const errMsg = respData?.error?.message || respData?.error || `上游返回 ${upstreamResp.status}`;
        context.waitUntil(logUsage(context.env, {
          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userId,
          providerId: provider.id,
          providerName: provider.name,
          model: resolvedModel,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          timestamp: new Date().toISOString(),
          status: "error",
          latency,
        }));
        return errorResponse(errMsg, upstreamResp.status, requestIdHeaders);
      }

      // --- 成功：格式转换 ---
      let result;
      if (provider.type === "anthropic") {
        result = convertAnthropicResponse(respData, resolvedModel);
      } else if (provider.type === "google") {
        result = convertGoogleResponse(respData, resolvedModel);
      } else if (provider.type === "cohere") {
        result = convertCohereResponse(respData, resolvedModel);
      } else {
        result = respData;
      }

      // 添加网关元信息
      result._gateway = {
        requestId,
        provider: provider.name,
        providerId: provider.id,
        latency,
        attempt: attempt + 1,
        ...(aliasResult ? { originalModel: model, resolvedModel } : {}),
      };

      // --- 记录成功的使用日志 ---
      const usage = result.usage || {};
      context.waitUntil(logUsage(context.env, {
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        providerId: provider.id,
        providerName: provider.name,
        model: resolvedModel,
        promptTokens: usage.prompt_tokens || usage.promptTokens || 0,
        completionTokens: usage.completion_tokens || usage.completionTokens || 0,
        totalTokens: usage.total_tokens || usage.totalTokens || 0,
        timestamp: new Date().toISOString(),
        status: "success",
        latency,
      }));

      return jsonResponse(result, 200, requestIdHeaders);
    }

    // 所有候选供应商都失败了
    const finalMsg = lastError?.message || "All providers failed";
    return errorResponse(`所有供应商均失败 (最后错误: ${finalMsg})`, lastError?.status || 502, requestIdHeaders);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("abort") || message.includes("AbortError")) {
      return errorResponse("请求超时", 408, requestIdHeaders);
    }
    console.error("Chat completions error:", message);
    return errorResponse(message, 500, requestIdHeaders);
  }
}

/**
 * OPTIONS /v1/chat/completions — CORS preflight
 */
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
