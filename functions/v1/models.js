/**
 * GET /v1/models — OpenAI 兼容的模型列表端点
 * 
 * 返回所有已启用供应商的可用模型
 * 认证：Bearer <gateway_api_key>
 */
import {
  corsHeaders, jsonResponse, errorResponse,
  validateApiKey, getProviders,
} from "./_lib.js";

export async function onRequestGet(context) {
  // --- 认证 ---
  if (!(await validateApiKey(context.request, context.env))) {
    return errorResponse("Invalid API key.", 401);
  }

  try {
    const providers = await getProviders(context.env);

    if (!providers || providers.length === 0) {
      return jsonResponse({
        object: "list",
        data: [],
      });
    }

    // 构建模型列表
    const models = [];
    for (const provider of providers) {
      if (!provider.enabled) continue;
      const providerModels = provider.models || [];
      for (const modelId of providerModels) {
        models.push({
          id: modelId,
          object: "model",
          created: Math.floor(new Date(provider.created_at || Date.now()).getTime() / 1000),
          owned_by: provider.name,
          permission: [],
          root: modelId,
          parent: null,
          _gateway: {
            providerId: provider.id,
            providerName: provider.name,
            providerType: provider.type,
          },
        });
      }
    }

    return jsonResponse({
      object: "list",
      data: models,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Models list error:", message);
    return errorResponse(message, 500);
  }
}

/**
 * OPTIONS /v1/models — CORS preflight
 */
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
