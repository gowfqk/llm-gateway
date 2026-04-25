/**
 * REST API 入口
 * 
 * 提供 Supabase REST API 代理功能
 * 认证：Bearer <gateway_api_key> 或 x-api-key header
 * 
 * 端点：
 * - GET /rest/providers - 获取供应商列表
 * - GET /rest/route_rules - 获取路由规则
 * - GET /rest/gateway_configs - 获取网关配置
 * - GET /rest/:table - 查询任意表 (需要权限)
 */

import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  extractApiKey,
  validateApiKey,
  getProviders,
  getRoutes,
  getGatewayConfigs,
  querySupabase,
  createRecord,
  updateRecord,
  patchRecord,
  deleteRecord,
} from "./_lib.js";

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/rest\/?/, "");

  // --- 认证 ---
  const apiKey = extractApiKey(request);
  if (!(await validateApiKey(apiKey, env))) {
    return errorResponse("Invalid API key.", 401);
  }

  // --- 路由处理 ---
  
  // /providers
  if (path === "providers") {
    const providers = await getProviders(env);
    if (Array.isArray(providers)) {
      return jsonResponse({ data: providers, count: providers.length });
    }
    return errorResponse(providers.error || "Failed to fetch providers", 500);
  }

  // /route_rules
  if (path === "route_rules") {
    const routes = await getRoutes(env);
    if (Array.isArray(routes)) {
      return jsonResponse({ data: routes, count: routes.length });
    }
    return errorResponse(routes.error || "Failed to fetch routes", 500);
  }

  // /gateway_configs
  if (path === "gateway_configs") {
    // 支持查询参数 ?user_id=xxx
    const userId = url.searchParams.get("user_id");
    const configs = await getGatewayConfigs(env, userId);
    if (Array.isArray(configs)) {
      return jsonResponse({ data: configs, count: configs.length });
    }
    return errorResponse(configs.error || "Failed to fetch configs", 500);
  }

  // /:table - 通用表查询
  if (path) {
    const table = path.split("/")[0];
    const queryParams = new URLSearchParams(url.search);
    
    // 构建查询选项
    const options = {};
    
    // 处理过滤条件 (?col1=value1&col2=value2)
    const eq = {};
    for (const [key, value] of queryParams.entries()) {
      if (key !== "user_id" && !key.startsWith("order") && !key.startsWith("limit")) {
        eq[key] = value;
      }
    }
    
    if (Object.keys(eq).length > 0) {
      options.eq = eq;
    }
    
    // 处理排序 (?order=created_at.desc)
    const order = queryParams.get("order");
    if (order) {
      options.order = order;
    }
    
    // 处理限制 (?limit=10)
    const limit = queryParams.get("limit");
    if (limit) {
      options.limit = parseInt(limit, 10);
    }
    
    const result = await querySupabase(table, options, env);
    
    if (result.error) {
      return errorResponse(result.error, 500);
    }
    
    return jsonResponse({ data: result, count: Array.isArray(result) ? result.length : 0 });
  }

  // 404
  return errorResponse("Not found", 404);
}

// --- POST /rest/:table - 创建新记录 ---
export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/rest\/?/, "");

  // --- 认证 ---
  const apiKey = extractApiKey(request);
  if (!(await validateApiKey(apiKey, env))) {
    return errorResponse("Invalid API key.", 401);
  }

  // 必须是表名
  if (!path) {
    return errorResponse("Table name required", 400);
  }

  const table = path.split("/")[0];

  try {
    const body = await request.json();
    const result = await createRecord(table, body, env);

    if (result.error) {
      return errorResponse(result.error, 500);
    }

    return jsonResponse(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    return errorResponse(message, 400);
  }
}

// --- PUT /rest/:table - 更新记录 ---
export async function onRequestPut(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/rest\/?/, "");

  // --- 认证 ---
  const apiKey = extractApiKey(request);
  if (!(await validateApiKey(apiKey, env))) {
    return errorResponse("Invalid API key.", 401);
  }

  // 必须是表名
  if (!path) {
    return errorResponse("Table name required", 400);
  }

  const table = path.split("/")[0];

  try {
    const body = await request.json();
    
    // 从查询参数中提取过滤条件
    const filters = {};
    for (const [key, value] of url.searchParams.entries()) {
      filters[key] = value;
    }

    const result = await updateRecord(table, filters, body, env);

    if (result.error) {
      return errorResponse(result.error, 500);
    }

    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    return errorResponse(message, 400);
  }
}

// --- PATCH /rest/:table - 部分更新记录 ---
export async function onRequestPatch(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/rest\/?/, "");

  // --- 认证 ---
  const apiKey = extractApiKey(request);
  if (!(await validateApiKey(apiKey, env))) {
    return errorResponse("Invalid API key.", 401);
  }

  // 必须是表名
  if (!path) {
    return errorResponse("Table name required", 400);
  }

  const table = path.split("/")[0];

  try {
    const body = await request.json();
    
    // 从查询参数中提取过滤条件
    const filters = {};
    for (const [key, value] of url.searchParams.entries()) {
      filters[key] = value;
    }

    const result = await patchRecord(table, filters, body, env);

    if (result.error) {
      return errorResponse(result.error, 500);
    }

    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    return errorResponse(message, 400);
  }
}

// --- DELETE /rest/:table - 删除记录 ---
export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/rest\/?/, "");

  // --- 认证 ---
  const apiKey = extractApiKey(request);
  if (!(await validateApiKey(apiKey, env))) {
    return errorResponse("Invalid API key.", 401);
  }

  // 必须是表名
  if (!path) {
    return errorResponse("Table name required", 400);
  }

  const table = path.split("/")[0];

  // 从查询参数中提取过滤条件
  const filters = {};
  for (const [key, value] of url.searchParams.entries()) {
    filters[key] = value;
  }

  const result = await deleteRecord(table, filters, env);

  if (result.error) {
    return errorResponse(result.error, 500);
  }

  return jsonResponse({ message: "Deleted successfully", data: result });
}
