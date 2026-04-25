/**
 * REST API 共享库
 * 
 * - Supabase REST API 代理
 * - 路由规则查询
 * - 供应商配置查询
 */

import { corsHeaders, jsonResponse, errorResponse } from "../_shared/lib.js";

// --- 从环境变量获取 Supabase 配置 ---
function getSupabaseConfig(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  return { url, key };
}

// --- 提取 API Key ---
function extractApiKey(request) {
  const xApiKey = request.headers.get("x-api-key")?.trim();
  if (xApiKey) return xApiKey;

  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

// --- 验证 API Key ---
async function validateApiKey(apiKey, env) {
  if (!apiKey) return false;

  const staticKeys = String(env?.GATEWAY_API_KEYS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  
  if (staticKeys.includes(apiKey)) return true;

  const { url, key } = getSupabaseConfig(env);
  if (!url || !key) return false;

  // 支持两种格式：gw_live_sk_xxx 和 {gw_live_sk_xxx}
  const queryValueWithBraces = encodeURIComponent(`{${apiKey}}`);
  const urlWithBraces = `${url.replace(/\/$/, "")}/rest/v1/gateway_configs?select=user_id&api_keys=cs.${queryValueWithBraces}&limit=1`;
  
  try {
    const response = await fetch(urlWithBraces, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const rows = await response.json().catch(() => []);
      if (Array.isArray(rows) && rows.length > 0) {
        return true;
      }
    }
  } catch (e) {
    console.error("Gateway auth lookup (with braces) failed:", e);
  }

  // 尝试不带花括号的格式
  const queryValueWithoutBraces = encodeURIComponent(apiKey);
  const urlWithoutBraces = `${url.replace(/\/$/, "")}/rest/v1/gateway_configs?select=user_id&api_keys=cs.${queryValueWithoutBraces}&limit=1`;
  
  const response = await fetch(urlWithoutBraces, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });

  if (response.ok) {
    const rows = await response.json().catch(() => []);
    if (Array.isArray(rows) && rows.length > 0) {
      return true;
    }
  }

  return false;
}

// --- 获取用户 Token (用于绕过 RLS) ---
async function getUserToken(env) {
  const authEmail = env.SUPABASE_AUTH_EMAIL;
  const authPassword = env.SUPABASE_AUTH_PASSWORD;
  
  if (!authEmail || !authPassword) return null;

  const { url } = getSupabaseConfig(env);
  if (!url) return null;

  try {
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "apikey": env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "",
        "Authorization": `Bearer ${env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ""}`,
        "Content-Type": "application/json",
        "user-agent": "hermes-gateway",
      },
      body: JSON.stringify({
        email: authEmail,
        password: authPassword,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.access_token;
    }
  } catch (e) {
    console.error("Failed to get user token:", e);
  }

  return null;
}

// --- 查询 Supabase REST API ---
async function querySupabase(table, options = {}, env, method = 'GET') {
  const { url, key } = getSupabaseConfig(env);
  if (!url || !key) {
    return { error: "Supabase not configured" };
  }

  // 获取用户 token 以绕过 RLS
  const userToken = await getUserToken(env);
  const authToken = userToken || key;

  // 构建查询 URL
  let queryUrl = `${url}/rest/v1/${table}?`;
  const params = new URLSearchParams();

  // 处理过滤条件
  if (options.eq) {
    for (const [key, value] of Object.entries(options.eq)) {
      params.append(key, `eq.${value}`);
    }
  }

  // 处理排序
  if (options.order) {
    params.append("order", options.order);
  }

  // 处理限制
  if (options.limit) {
    params.append("limit", options.limit.toString());
  }

  // 处理选择字段
  if (options.select) {
    params.append("select", options.select);
  }

  // 处理范围查询
  if (options.gte) {
    for (const [key, value] of Object.entries(options.gte)) {
      params.append(key, `gte.${value}`);
    }
  }

  if (options.lte) {
    for (const [key, value] of Object.entries(options.lte)) {
      params.append(key, `lte.${value}`);
    }
  }

  if (params.toString()) {
    queryUrl += params.toString();
  }

  try {
    const response = await fetch(queryUrl, {
      method,
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json",
        "Prefer": method === 'POST' || method === 'PUT' || method === 'PATCH' ? "return=representation" : "return=representation",
      },
      body: method === 'GET' ? undefined : JSON.stringify(options.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Supabase query failed (${response.status}):`, errorText);
      return { error: `Supabase query failed: ${response.status} ${errorText}` };
    }

    // GET 请求返回数组，其他方法返回单条记录
    if (method === 'GET') {
      return await response.json();
    } else {
      // POST/PUT/PATCH/DELETE 返回单条记录
      return await response.json();
    }
  } catch (e) {
    console.error("Supabase query error:", e);
    return { error: e.message || "Unknown error" };
  }
}

// --- 获取供应商列表 ---
export async function getProviders(env) {
  return querySupabase("providers", {
    eq: { enabled: true },
    order: "created_at.asc",
  }, env);
}

// --- 获取路由规则 ---
export async function getRoutes(env) {
  return querySupabase("route_rules", {
    eq: { enabled: true },
    order: "priority.asc",
  }, env);
}

// --- 获取网关配置 ---
export async function getGatewayConfigs(env, userId = null) {
  let options = {
    order: "created_at.desc",
    limit: 100,
  };

  if (userId) {
    options.eq = { user_id: userId };
  }

  return querySupabase("gateway_configs", options, env);
}

// --- 创建记录 (POST) ---
export async function createRecord(table, data, env) {
  return querySupabase(table, { body: data }, env, 'POST');
}

// --- 更新记录 (PUT) ---
export async function updateRecord(table, filters, data, env) {
  return querySupabase(table, { body: { ...data, ...filters } }, env, 'PUT');
}

// --- 部分更新记录 (PATCH) ---
export async function patchRecord(table, filters, data, env) {
  return querySupabase(table, { body: { ...data, ...filters } }, env, 'PATCH');
}

// --- 删除记录 (DELETE) ---
export async function deleteRecord(table, filters, env) {
  return querySupabase(table, { ...filters }, env, 'DELETE');
}

// --- 导出 ---
export {
  corsHeaders,
  jsonResponse,
  errorResponse,
  extractApiKey,
  validateApiKey,
  querySupabase,
  getSupabaseConfig,
};
