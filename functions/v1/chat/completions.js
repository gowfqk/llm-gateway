/**
 * POST /v1/chat/completions — OpenAI 兼容的 Chat Completions 端点
 * 
 * 支持流式和非流式响应，根据路由规则自动选择供应商
 * 认证：Bearer <gateway_api_key>
 */
import {
  corsHeaders, jsonResponse, errorResponse,
  validateApiKey, getProviders, getRoutes,
  resolveProvider, buildUpstreamUrl, buildUpstreamHeaders,
  buildUpstreamBody, convertAnthropicResponse, convertGoogleResponse,
  handleStreamRequest, logUsage,
} from "../_lib.js";

export async function onRequestPost(context) {
  // --- 认证 ---
  const authResult = await validateApiKey(context.request, context.env);
  if (!authResult.isValid) {
    return errorResponse("Invalid API key. Provide a valid Bearer token in Authorization header.", 401);
  }
  const { userId } = authResult;

  try {
    const body = await context.request.json();
    const model = body.model;
    if (!model) {
      return errorResponse("Missing required parameter: 'model'", 400);
    }

    // --- 加载供应商和路由配置 ---
    const [providers, routes] = await Promise.all([
      getProviders(context.env),
      getRoutes(context.env),
    ]);

    if (!providers || providers.length === 0) {
      return errorResponse("No providers configured. Please add providers in the dashboard.", 503);
    }

    // --- 路由匹配 ---
    const provider = resolveProvider(model, providers, routes);
    if (!provider) {
      return errorResponse(`Model '${model}' not found. Available models: /v1/models`, 404);
    }

    // --- 构建上游请求 ---
    const upstreamUrl = buildUpstreamUrl(provider, model);
    const upstreamHeaders = buildUpstreamHeaders(provider, model);
    const upstreamBody = buildUpstreamBody(provider, model, body);
    const isStream = body.stream === true;

    // --- 流式响应 ---
    if (isStream) {
      return await handleStreamRequest(upstreamUrl, upstreamHeaders, upstreamBody, provider.type, model);
    }

    // --- 非流式请求 ---
    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2 分钟超时

    let upstreamResp;
    try {
      upstreamResp = await fetch(upstreamUrl, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify(upstreamBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const latency = Date.now() - startTime;
    const respData = await upstreamResp.json().catch(() => null);

    if (!upstreamResp.ok) {
      const errMsg = respData?.error?.message || respData?.error || `上游返回 ${upstreamResp.status}`;
      // 记录失败的请求
      await logUsage(context.env, {
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        providerId: provider.id,
        providerName: provider.name,
        model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        timestamp: new Date().toISOString(),
        status: "error",
        latency,
      });
      return errorResponse(errMsg, upstreamResp.status);
    }

    // --- 格式转换 ---
    let result;
    if (provider.type === "anthropic") {
      result = convertAnthropicResponse(respData, model);
    } else if (provider.type === "google") {
      result = convertGoogleResponse(respData, model);
    } else {
      // OpenAI 兼容格式直接返回
      result = respData;
    }

    // 添加网关元信息
    result._gateway = {
      provider: provider.name,
      providerId: provider.id,
      latency,
    };

    // --- 记录成功的使用日志 ---
    const usage = result.usage || {};
    await logUsage(context.env, {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      providerId: provider.id,
      providerName: provider.name,
      model,
      promptTokens: usage.prompt_tokens || usage.promptTokens || 0,
      completionTokens: usage.completion_tokens || usage.completionTokens || 0,
      totalTokens: usage.total_tokens || usage.totalTokens || 0,
      cost: 0, // 可以根据 token 数量计算成本
      timestamp: new Date().toISOString(),
      status: "success",
      latency,
    });

    return jsonResponse(result);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("abort") || message.includes("AbortError")) {
      return errorResponse("请求超时", 408);
    }
    console.error("Chat completions error:", message);
    return errorResponse(message, 500);
  }
}

/**
 * OPTIONS /v1/chat/completions — CORS preflight
 */
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
