/**
 * GET /v1/models — OpenAI 兼容的模型列表端点
 * 
 * 返回所有已启用供应商的可用模型
 * 认证：Bearer <gateway_api_key>
 */
import {
  corsHeaders, jsonResponse, errorResponse,
  validateApiKey, getProviders, getRoutes,
} from "./_lib.js";

export async function onRequestGet(context) {
  // --- 认证 ---
  if (!(await validateApiKey(context.request, context.env))) {
    return errorResponse("Invalid API key.", 401);
  }

  try {
    const [providers, routes] = await Promise.all([
      getProviders(context.env),
      getRoutes(context.env),
    ]);

    if (!providers || providers.length === 0) {
      return jsonResponse({
        object: "list",
        data: [],
      });
    }

    const seenModels = new Set();
    const models = [];

    // 1. 先添加路由规则中的 pattern（包括 fallback 的触发模型名）
    for (const route of (routes || [])) {
      if (!route.enabled || !route.pattern) continue;
      if (seenModels.has(route.pattern)) continue;
      seenModels.add(route.pattern);
      models.push({
        id: route.pattern,
        object: "model",
        created: Math.floor(new Date(route.created_at || Date.now()).getTime() / 1000),
        owned_by: "route",
        permission: [],
        root: route.pattern,
        parent: null,
        _gateway: {
          routeId: route.id,
          routeName: route.name,
          routeMode: route.mode,
        },
      });
    }

    // 2. 再添加供应商的实际模型
    for (const provider of providers) {
      if (!provider.enabled) continue;
      const providerModels = provider.models || [];
      for (const modelId of providerModels) {
        if (seenModels.has(modelId)) continue;
        seenModels.add(modelId);
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
