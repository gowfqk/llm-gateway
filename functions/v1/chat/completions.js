/**
 * POST /v1/chat/completions — OpenAI 兼容的 Chat Completions 端点
 * 
 * 支持流式和非流式响应，根据路由规则自动选择供应商
 * 认证：Bearer <gateway_api_key>
 */
import {
  corsHeaders, jsonResponse, errorResponse,
  validateApiKey, getProviders, getRoutes,
  resolveProvider, resolveProviderCandidates,
  buildUpstreamUrl, buildUpstreamHeaders,
  buildUpstreamBody, convertAnthropicResponse, convertGoogleResponse,
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

    // --- 路由匹配（含 fallback 候选列表） ---
    const candidates = resolveProviderCandidates(model, providers, routes);
    if (!candidates || candidates.length === 0) {
      return errorResponse(`Model '${model}' not found. Available models: /v1/models`, 404, requestIdHeaders);
    }

    // --- 构建上游请求 ---
    const isStream = body.stream === true;

    // --- 流式响应（仅使用首个供应商，不重试） ---
    if (isStream) {
      const provider = candidates[0];
      const upstreamUrl = buildUpstreamUrl(provider, model);
      const upstreamHeaders = { ...buildUpstreamHeaders(provider, model), "x-request-id": requestId };
      const upstreamBody = buildUpstreamBody(provider, model, body);
      return await handleStreamRequest(upstreamUrl, upstreamHeaders, upstreamBody, provider.type, model);
    }

    // --- 非流式请求（支持 fallback 重试） ---
    let lastError = null;
    const maxRetries = Math.min(candidates.length, 3); // 最多尝试 3 个供应商

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const provider = candidates[attempt];
      const upstreamUrl = buildUpstreamUrl(provider, model);
      const upstreamHeaders = { ...buildUpstreamHeaders(provider, model), "x-request-id": requestId };
      const upstreamBody = buildUpstreamBody(provider, model, body);

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
          model,
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
          model,
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
        result = convertAnthropicResponse(respData, model);
      } else if (provider.type === "google") {
        result = convertGoogleResponse(respData, model);
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
      };

      // --- 记录成功的使用日志 ---
      const usage = result.usage || {};
      context.waitUntil(logUsage(context.env, {
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        providerId: provider.id,
        providerName: provider.name,
        model,
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
