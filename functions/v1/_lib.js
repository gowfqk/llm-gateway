/**
 * 共享库 — API 端点公共逻辑
 * 
 * - 从 Supabase 读取供应商/路由配置
 * - Bearer token 认证
 * - 模型路由匹配
 * - 请求转发
 */

// --- CORS 通用头 ---
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// --- Cloudflare Workers 同源请求限制 ---
// Cloudflare Workers 无法直接 fetch 同在 Cloudflare 网络上的域名，会返回 403 Forbidden
// 这些域名需要在请求时添加特殊处理或通过代理转发
const CF_BLOCKED_DOMAINS = [
  "api.groq.com",
  "groq.com",
];

function isCfBlockedDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return CF_BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/**
 * 网关级别的 fetch — 处理 Cloudflare Workers 的同源限制
 * 对于被限制的域名，检测 403 并返回明确错误信息
 */
export async function gatewayFetch(url, options) {
  const response = await fetch(url, options);
  
  // Cloudflare Workers 对 CF 网络上的域名返回 403
  if (response.status === 403 && isCfBlockedDomain(url)) {
    // 读取原始 403 响应体
    let originalBody = "";
    try {
      originalBody = await response.text();
    } catch {}
    
    // 创建新的错误响应，保持原始格式
    const errorResponse = new Response(
      JSON.stringify({
        error: {
          message: "Cloudflare Workers 无法直接访问此域名。请将供应商的 Base URL 改为中转/镜像地址，或配置 HTTP 代理。",
          type: "cf_same_origin_error",
          code: "cf_workers_403",
          original_status: 403,
        }
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
    return errorResponse;
  }
  
  return response;
}

// --- JSON 响应工具 ---
export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...extraHeaders },
  });
}

export function errorResponse(message, status = 400, extraHeaders = {}) {
  return jsonResponse({ error: { message, type: "invalid_request_error" } }, status, extraHeaders);
}

// --- 生成请求 ID ---
export function generateRequestId() {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// --- 从环境变量获取 Supabase 配置 ---
function getSupabaseConfig(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  // API 端点优先使用 service_role key 绕过 RLS，否则用 anon key
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  return { url, key };
}

function extractGatewayApiKey(request) {
  const xApiKey = request.headers.get("x-api-key")?.trim();
  if (xApiKey) return xApiKey;

  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function parseStaticGatewayKeys(env) {
  return String(env?.GATEWAY_API_KEYS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

// --- API Key 验证缓存 ---
// Cloudflare Workers 的模块级变量在同一 isolate 内存活（通常 ~30s），
// 可作为短期缓存避免每次请求都查 Supabase。
const API_KEY_CACHE = new Map(); // key → { result: {isValid, userId}, expiresAt: number }
const CACHE_TTL_MS = 60_000; // 缓存 60 秒

function getCachedKeyResult(apiKey) {
  const entry = API_KEY_CACHE.get(apiKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    API_KEY_CACHE.delete(apiKey);
    return null;
  }
  return entry.result;
}

function setCachedKeyResult(apiKey, result) {
  // 防止缓存无限膨胀：限制最多 500 条
  if (API_KEY_CACHE.size > 500) {
    // 清除过期条目
    const now = Date.now();
    for (const [k, v] of API_KEY_CACHE) {
      if (now > v.expiresAt) API_KEY_CACHE.delete(k);
    }
    // 如果仍然超限，清除最早的一半
    if (API_KEY_CACHE.size > 500) {
      const keys = [...API_KEY_CACHE.keys()];
      for (let i = 0; i < keys.length / 2; i++) {
        API_KEY_CACHE.delete(keys[i]);
      }
    }
  }
  API_KEY_CACHE.set(apiKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function validateGatewayApiKey(apiKey, env) {
  if (!apiKey) return { isValid: false, userId: null, allowedModels: null };

  // 检查缓存
  const cached = getCachedKeyResult(apiKey);
  if (cached) return cached;
  
  const staticKeys = parseStaticGatewayKeys(env);
  if (staticKeys.includes(apiKey)) {
    // 静态密钥无法关联到特定用户，无模型限制
    const result = { isValid: true, userId: null, allowedModels: null };
    setCachedKeyResult(apiKey, result);
    return result;
  }

  const supabaseUrl = env?.SUPABASE_URL;
  const serviceRoleKey = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return { isValid: false, userId: null, allowedModels: null };

  // 查询时尝试获取 api_key_entries 以提取权限
  // 注意：api_key_entries 列可能尚未创建（migration 未执行），需要优雅降级
  const selectWithPermissions = "user_id,api_key_entries";
  const selectBasic = "user_id";

  // 支持两种格式：gw_live_sk_xxx 和 {gw_live_sk_xxx}
  // 先尝试带花括号的格式（兼容旧数据）
  const queryValueWithBraces = encodeURIComponent(`{${apiKey}}`);
  
  // 尝试带 api_key_entries 的查询，失败则回退到基础查询
  let rows = await queryGatewayConfig(supabaseUrl, serviceRoleKey, queryValueWithBraces, selectWithPermissions);
  if (rows === null) {
    // 可能是 api_key_entries 列不存在，回退
    rows = await queryGatewayConfig(supabaseUrl, serviceRoleKey, queryValueWithBraces, selectBasic);
  }
  
  if (rows && rows.length > 0) {
    const allowedModels = extractAllowedModels(apiKey, rows[0].api_key_entries);
    const result = { isValid: true, userId: rows[0].user_id, allowedModels };
    setCachedKeyResult(apiKey, result);
    return result;
  }

  // 如果不带花括号的格式，尝试直接匹配
  const queryValueWithoutBraces = encodeURIComponent(apiKey);
  
  rows = await queryGatewayConfig(supabaseUrl, serviceRoleKey, queryValueWithoutBraces, selectWithPermissions);
  if (rows === null) {
    rows = await queryGatewayConfig(supabaseUrl, serviceRoleKey, queryValueWithoutBraces, selectBasic);
  }
  
  if (rows && rows.length > 0) {
    const allowedModels = extractAllowedModels(apiKey, rows[0].api_key_entries);
    const result = { isValid: true, userId: rows[0].user_id, allowedModels };
    setCachedKeyResult(apiKey, result);
    return result;
  }
  
  // 缓存无效 key 结果（较短 TTL 防止暴力尝试）
  const invalidResult = { isValid: false, userId: null, allowedModels: null };
  API_KEY_CACHE.set(apiKey, { result: invalidResult, expiresAt: Date.now() + 10_000 }); // 10s
  return invalidResult;
}

/**
 * 查询 gateway_configs 表，返回匹配的行或 null（查询失败时返回 null）
 */
async function queryGatewayConfig(supabaseUrl, serviceRoleKey, encodedKeyValue, selectFields) {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/gateway_configs?select=${selectFields}&api_keys=cs.${encodedKeyValue}&limit=1`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) return null; // 可能是列不存在或其他错误
    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? rows : null;
  } catch (e) {
    console.error("[Gateway auth] query failed:", e);
    return null;
  }
}

/**
 * 从 api_key_entries JSONB 中提取指定 key 的 allowedModels
 * 返回 null 表示无限制，返回 string[] 表示白名单（支持通配符）
 */
function extractAllowedModels(apiKey, apiKeyEntries) {
  if (!Array.isArray(apiKeyEntries) || apiKeyEntries.length === 0) return null;
  const entry = apiKeyEntries.find((e) => e.key === apiKey);
  if (!entry) return null; // key 不在 entries 中（旧格式），无限制
  if (!Array.isArray(entry.allowedModels) || entry.allowedModels.length === 0) return null;
  return entry.allowedModels;
}

/**
 * 检查模型是否在允许列表中（支持通配符匹配）
 * allowedModels 为 null 时表示无限制
 */
export function isModelAllowed(model, allowedModels) {
  if (!allowedModels || allowedModels.length === 0) return true; // 无限制
  for (const pattern of allowedModels) {
    if (pattern === model) return true;
    if (pattern === "*") return true;
    // 通配符匹配
    const regexStr = "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
    if (new RegExp(regexStr).test(model)) return true;
  }
  return false;
}

async function hasGatewayAuthConfigured(env) {
  return parseStaticGatewayKeys(env).length > 0 || Boolean(env?.SUPABASE_URL && env?.SUPABASE_SERVICE_ROLE_KEY);
}

// --- 获取 Supabase User Access Token（通过登录 API） ---
async function getSupabaseUserToken(env) {
  const { url, key } = getSupabaseConfig(env);
  if (!url || !key) return null;

  const authEmail = env.SUPABASE_AUTH_EMAIL;
  const authPassword = env.SUPABASE_AUTH_PASSWORD;
  if (!authEmail || !authPassword) return null;

  try {
    const resp = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "apikey": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: authEmail, password: authPassword }),
    });
    if (!resp.ok) {
      console.error("Supabase auth failed:", resp.status);
      return null;
    }
    const data = await resp.json();
    return data.access_token || null;
  } catch (e) {
    console.error("Supabase auth error:", e);
    return null;
  }
}

// --- 解析环境变量引用（$VAR_NAME → env.VAR_NAME） ---
function resolveEnvRef(value, env) {
  if (typeof value === "string" && value.startsWith("$")) {
    return env[value.slice(1)] || value;
  }
  return value;
}

// --- 获取所有已启用的供应商 ---
// 优先从环境变量 PROVIDERS_JSON 读取，否则从 Supabase 查询
export async function getProviders(env) {
  // 方案1：从环境变量直接读取（JSON 字符串，最稳定可靠）
  if (env.PROVIDERS_JSON) {
    try {
      const providers = JSON.parse(env.PROVIDERS_JSON);
      // 解析环境变量引用（如 api_key: "$IFLYTEK_API_KEY" → 实际值）
      return providers.filter((p) => p.enabled !== false).map((p) => ({
        ...p,
        api_key: resolveEnvRef(p.api_key, env),
        base_url: resolveEnvRef(p.base_url, env),
      }));
    } catch (e) {
      console.error("Failed to parse PROVIDERS_JSON:", e);
    }
  }

  // 方案2：从 Supabase REST API 查询（需要 user token 绕过 RLS）
  const { url, key } = getSupabaseConfig(env);
  if (!url || !key) return [];

  // 获取 user token 以绕过 RLS
  const userToken = await getSupabaseUserToken(env);
  const authToken = userToken || key; // fallback to anon key

  const queryUrl = `${url}/rest/v1/providers?enabled=eq.true&order=created_at.asc`;
  const resp = await fetch(queryUrl, {
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!resp.ok) {
    console.error("Supabase providers query failed:", resp.status);
    return [];
  }
  return resp.json();
}

// --- 获取路由规则 ---
export async function getRoutes(env) {
  const { url, key } = getSupabaseConfig(env);
  if (!url || !key) return [];

  // 获取 user token 以绕过 RLS
  const userToken = await getSupabaseUserToken(env);
  const authToken = userToken || key;

  const queryUrl = `${url}/rest/v1/route_rules?enabled=eq.true&order=priority.asc`;
  const resp = await fetch(queryUrl, {
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!resp.ok) return [];
  return resp.json();
}

// --- 验证 API Key ---
export async function validateApiKey(request, env) {
  if (!(await hasGatewayAuthConfigured(env))) {
    // 如果没配置任何密钥，允许所有请求（开发模式）
    return { isValid: true, userId: null, allowedModels: null };
  }

  const token = extractGatewayApiKey(request);
  return validateGatewayApiKey(token, env);
}

// --- 通配符匹配 ---
function matchPattern(pattern, model) {
  if (pattern === model) return true;
  // 将 glob 模式转为正则：* → .*
  const regexStr = "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
  return new RegExp(regexStr).test(model);
}

// --- 根据模型别名解析实际模型名 ---
// 遍历所有供应商的 model_aliases / modelAliases，如果请求的模型名是别名则返回 { actualModel, provider, pinnedProvider }
// 支持两种别名格式：
//   1. 简单格式: "gpt4" → "gpt-4o"          (只做模型名映射，不指定供应商)
//   2. 供应商格式: "gpt4" → "openai/gpt-4o"  (同时指定供应商+模型，pinnedProvider 不为 null)
//      供应商标识符匹配规则：按 provider.type 或 provider.id 或 provider.name (忽略大小写) 匹配
export function resolveModelAlias(model, providers) {
  for (const provider of providers) {
    if (!provider.enabled) continue;
    const aliases = provider.model_aliases || provider.modelAliases;
    if (aliases && typeof aliases === "object") {
      if (aliases[model]) {
        const aliasValue = aliases[model];
        // 检查是否是 "provider/model" 格式
        const slashIndex = aliasValue.indexOf("/");
        if (slashIndex > 0) {
          const providerIdent = aliasValue.slice(0, slashIndex);
          const actualModel = aliasValue.slice(slashIndex + 1);
          if (actualModel) {
            // 查找匹配的供应商（按 type、id、name 匹配）
            const pinnedProvider = findProviderByIdent(providerIdent, providers);
            if (pinnedProvider) {
              return { actualModel, provider, pinnedProvider };
            }
            // 如果找不到匹配供应商，当作模型名中包含 / 的情况（如 openrouter 格式 "meta-llama/llama-3.1-70b"）
          }
        }
        // 简单格式：只做模型名映射
        return { actualModel: aliasValue, provider, pinnedProvider: null };
      }
    }
  }
  return null;
}

// --- 根据标识符查找供应商 ---
// 支持按 type / id / name 匹配（忽略大小写）
function findProviderByIdent(ident, providers) {
  const lower = ident.toLowerCase();
  // 优先匹配 type（最常用：openai, anthropic, google 等）
  let found = providers.find((p) => p.enabled && (p.type || "").toLowerCase() === lower);
  if (found) return found;
  // 其次匹配 id
  found = providers.find((p) => p.enabled && (p.id || "").toLowerCase() === lower);
  if (found) return found;
  // 最后匹配 name
  found = providers.find((p) => p.enabled && (p.name || "").toLowerCase() === lower);
  if (found) return found;
  return null;
}

// --- 根据模型名找到目标供应商 ---
export function resolveProvider(model, providers, routes) {
  // 1. 先匹配路由规则（按优先级）
  for (const route of routes) {
    if (!route.enabled) continue;
    if (route.mode === "fallback") {
      // fallback 模式: 先匹配路由 pattern，再按 ordered_candidates 顺序查找可用 provider
      if (matchPattern(route.pattern, model) && route.ordered_candidates) {
        for (const candidate of route.ordered_candidates) {
          const provider = providers.find((p) => p.id === candidate.providerId && p.enabled);
          if (provider) return provider;
        }
      }
    } else if (matchPattern(route.pattern, model)) {
      // pattern 模式: 匹配到路由，返回目标 provider
      const provider = providers.find((p) => p.id === route.target_provider_id && p.enabled);
      if (provider) return provider;
    }
  }

  // 2. 直接匹配供应商的 models 列表
  for (const provider of providers) {
    if (!provider.enabled) continue;
    if (provider.models && provider.models.includes(model)) {
      return provider;
    }
  }

  // 3. 通配符匹配供应商 models（如 provider.models 里有 "gpt-*"）
  for (const provider of providers) {
    if (!provider.enabled) continue;
    if (provider.models) {
      for (const m of provider.models) {
        if (matchPattern(m, model)) return provider;
      }
    }
  }

  // 4. 如果只有一个启用的供应商，直接使用
  const enabled = providers.filter((p) => p.enabled);
  if (enabled.length === 1) return enabled[0];

  return null;
}

/**
 * 解析所有能承载指定模型的供应商（用于 fallback）
 * 返回按优先级排序的 { provider, resolvedModel } 数组
 * resolvedModel 是实际要发送给上游的模型名（fallback 模式下可能是候选的第一个模型）
 */
export function resolveProviderCandidates(model, providers, routes) {
  const candidates = [];
  const seenIds = new Set();

  // 1. 路由规则匹配（按优先级，启用的优先）
  for (const route of routes) {
    if (!route.enabled) continue;
    if (route.mode === "fallback") {
      // fallback 模式: 先匹配路由 pattern，再按 ordered_candidates 顺序收集可用 provider
      if (matchPattern(route.pattern, model) && route.ordered_candidates) {
        for (const candidate of route.ordered_candidates) {
          const provider = providers.find((p) => p.id === candidate.providerId && p.enabled);
          if (provider && !seenIds.has(provider.id)) {
            // 使用候选的第一个模型作为实际模型名；如果没有则用原始模型名
            const resolvedModel = (candidate.models && candidate.models.length > 0) ? candidate.models[0] : model;
            candidates.push({ provider, resolvedModel });
            seenIds.add(provider.id);
          }
        }
      }
    } else if (matchPattern(route.pattern, model)) {
      // pattern 模式: 匹配到路由，添加目标 provider
      const provider = providers.find((p) => p.id === route.target_provider_id && p.enabled);
      if (provider && !seenIds.has(provider.id)) {
        candidates.push({ provider, resolvedModel: model });
        seenIds.add(provider.id);
      }
    }
  }

  // 2. 直接匹配供应商的 models 列表
  for (const provider of providers) {
    if (!provider.enabled || seenIds.has(provider.id)) continue;
    if (provider.models && provider.models.includes(model)) {
      candidates.push({ provider, resolvedModel: model });
      seenIds.add(provider.id);
    }
  }

  // 3. 通配符匹配
  for (const provider of providers) {
    if (!provider.enabled || seenIds.has(provider.id)) continue;
    if (provider.models) {
      for (const m of provider.models) {
        if (matchPattern(m, model)) {
          candidates.push({ provider, resolvedModel: model });
          seenIds.add(provider.id);
          break;
        }
      }
    }
  }

  // 4. 如果没有匹配且只有一个启用供应商
  if (candidates.length === 0) {
    const enabled = providers.filter((p) => p.enabled);
    if (enabled.length === 1) return [{ provider: enabled[0], resolvedModel: model }];
  }

  return candidates;
}

// --- 构建上游请求 URL ---
export function buildUpstreamUrl(provider, model, stream = false) {
  let base = provider.base_url.replace(/\/+$/, "");
  
  // Anthropic 特殊处理
  if (provider.type === "anthropic") {
    return `${base}/messages`;
  }
  
  // Google AI 特殊处理
  if (provider.type === "google") {
    const endpoint = stream ? "streamGenerateContent" : "generateContent";
    return `${base}/models/${model}:${endpoint}${stream ? "?alt=sse" : ""}`;
  }

  // Cohere v2 特殊处理
  if (provider.type === "cohere") {
    return `${base}/chat`;
  }

  // OpenAI 兼容（绝大多数供应商包括 xAI, Mistral）
  return `${base}/chat/completions`;
}

// --- 构建上游请求头 ---
export function buildUpstreamHeaders(provider, model) {
  const headers = { "Content-Type": "application/json" };

  switch (provider.type) {
    case "anthropic":
      headers["x-api-key"] = provider.api_key;
      headers["anthropic-version"] = "2023-06-01";
      break;
    case "google":
      headers["x-goog-api-key"] = provider.api_key;
      break;
    case "cohere":
      headers["Authorization"] = `Bearer ${provider.api_key}`;
      headers["X-Client-Name"] = "llm-gateway";
      break;
    default:
      // OpenAI 兼容格式（包括 xAI, Mistral）
      headers["Authorization"] = `Bearer ${provider.api_key}`;
      break;
  }

  return headers;
}

// --- 转换请求体为上游格式 ---
export function buildUpstreamBody(provider, model, body) {
  // Anthropic 格式转换
  if (provider.type === "anthropic") {
    const messages = body.messages || [];
    let system = "";
    const filtered = messages.filter((m) => {
      if (m.role === "system") { system = m.content; return false; }
      return true;
    });
    return {
      model: model,
      messages: filtered,
      max_tokens: body.max_tokens || 4096,
      ...(system ? { system } : {}),
      ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
      ...(body.top_p !== undefined ? { top_p: body.top_p } : {}),
      ...(body.stream ? { stream: body.stream } : {}),
    };
  }

  // Google AI 格式转换
  if (provider.type === "google") {
    const messages = body.messages || [];
    const contents = [];
    for (const m of messages) {
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }
    const generationConfig = {};
    if (body.temperature !== undefined) generationConfig.temperature = body.temperature;
    if (body.max_tokens !== undefined) generationConfig.maxOutputTokens = body.max_tokens;
    return {
      contents,
      ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
    };
  }

  // Cohere v2 格式转换
  if (provider.type === "cohere") {
    const messages = body.messages || [];
    return {
      model,
      messages: messages.map((m) => ({
        role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      ...(body.max_tokens !== undefined ? { max_tokens: body.max_tokens } : {}),
      ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
      ...(body.top_p !== undefined ? { p: body.top_p } : {}),
      ...(body.stream ? { stream: body.stream } : {}),
    };
  }

  // OpenAI 兼容格式（包括 xAI/Grok, Mistral）— 直接透传
  return { ...body, model };
}

// --- 转换 Anthropic 响应为 OpenAI 格式 ---
export function convertAnthropicResponse(data, model) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: data.content?.[0]?.text || "",
      },
      finish_reason: data.stop_reason === "end_turn" ? "stop" : data.stop_reason || "stop",
    }],
    usage: {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

// --- 转换 Google AI 响应为 OpenAI 格式 ---
export function convertGoogleResponse(data, model) {
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text || "";
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: "assistant", content: text },
      finish_reason: candidate?.finishReason === "STOP" ? "stop" : "stop",
    }],
    usage: {
      prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
      completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: data.usageMetadata?.totalTokenCount || 0,
    },
  };
}

// --- 转换 Cohere v2 响应为 OpenAI 格式 ---
export function convertCohereResponse(data, model) {
  const text = data.message?.content?.[0]?.text || data.text || "";
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: "assistant", content: text },
      finish_reason: data.finish_reason === "COMPLETE" ? "stop" : data.finish_reason || "stop",
    }],
    usage: {
      prompt_tokens: data.usage?.billed_units?.input_tokens || data.meta?.tokens?.input_tokens || 0,
      completion_tokens: data.usage?.billed_units?.output_tokens || data.meta?.tokens?.output_tokens || 0,
      total_tokens: (data.usage?.billed_units?.input_tokens || data.meta?.tokens?.input_tokens || 0) + (data.usage?.billed_units?.output_tokens || data.meta?.tokens?.output_tokens || 0),
    },
  };
}

// --- 记录使用日志到 Supabase ---
export async function logUsage(env, record) {
  const { url, key } = getSupabaseConfig(env);
  if (!url || !key) {
    console.warn("[logUsage] Supabase 未配置，跳过日志记录");
    return;
  }

  // 自动计算成本
  const cost = record.cost || calculateCost(record.model, record.promptTokens, record.completionTokens);

  try {
    const response = await fetch(`${url}/rest/v1/usage_records`, {
      method: "POST",
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        id: record.id,
        user_id: record.userId,
        provider_id: record.providerId,
        provider_name: record.providerName,
        model: record.model,
        prompt_tokens: record.promptTokens,
        completion_tokens: record.completionTokens,
        total_tokens: record.totalTokens,
        cost,
        timestamp: record.timestamp,
        status: record.status,
        latency: record.latency,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "未知错误");
      console.error(`[logUsage] 写入失败: HTTP ${response.status}, ${errText}`);
    } else {
      console.log(`[logUsage] 成功记录使用日志: ${record.id}`);
    }
  } catch (err) {
    console.error(`[logUsage] 写入异常:`, err);
  }
}

// --- 模型定价表（美元 / 1M tokens） ---
// 来源：各供应商官方定价页，定期更新
const MODEL_PRICING = {
  // OpenAI
  "gpt-4o":             { prompt: 2.50, completion: 10.00 },
  "gpt-4o-mini":        { prompt: 0.15, completion: 0.60 },
  "gpt-4-turbo":        { prompt: 10.00, completion: 30.00 },
  "gpt-4":              { prompt: 30.00, completion: 60.00 },
  "gpt-3.5-turbo":      { prompt: 0.50, completion: 1.50 },
  "o1":                 { prompt: 15.00, completion: 60.00 },
  "o1-mini":            { prompt: 3.00, completion: 12.00 },
  "o3-mini":            { prompt: 1.10, completion: 4.40 },
  // Anthropic
  "claude-sonnet-4-20250514":    { prompt: 3.00, completion: 15.00 },
  "claude-3-5-sonnet-20241022":  { prompt: 3.00, completion: 15.00 },
  "claude-3-5-haiku-20241022":   { prompt: 0.80, completion: 4.00 },
  "claude-3-opus-20240229":      { prompt: 15.00, completion: 75.00 },
  "claude-3-haiku-20240307":     { prompt: 0.25, completion: 1.25 },
  // Google
  "gemini-2.0-flash":   { prompt: 0.10, completion: 0.40 },
  "gemini-1.5-pro":     { prompt: 1.25, completion: 5.00 },
  "gemini-1.5-flash":   { prompt: 0.075, completion: 0.30 },
  // DeepSeek
  "deepseek-chat":      { prompt: 0.14, completion: 0.28 },
  "deepseek-coder":     { prompt: 0.14, completion: 0.28 },
  "deepseek-reasoner":  { prompt: 0.55, completion: 2.19 },
  // Groq (免费额度，实际 0)
  "llama-3.1-8b-instant":   { prompt: 0.05, completion: 0.08 },
  "llama-3.1-70b-versatile": { prompt: 0.59, completion: 0.79 },
  "mixtral-8x7b-32768":     { prompt: 0.24, completion: 0.24 },
  // Moonshot
  "moonshot-v1-8k":     { prompt: 0.85, completion: 0.85 },
  "moonshot-v1-32k":    { prompt: 1.70, completion: 1.70 },
  "moonshot-v1-128k":   { prompt: 4.25, completion: 4.25 },
  // 通义千问 (ModelScope/DashScope)
  "qwen-turbo":         { prompt: 0.28, completion: 0.84 },
  "qwen-plus":          { prompt: 0.57, completion: 1.70 },
  "qwen-max":           { prompt: 2.83, completion: 8.50 },
  // xAI (Grok)
  "grok-3":             { prompt: 3.00, completion: 15.00 },
  "grok-3-mini":        { prompt: 0.30, completion: 0.50 },
  "grok-2":             { prompt: 2.00, completion: 10.00 },
  "grok-2-mini":        { prompt: 0.10, completion: 0.40 },
  // Mistral AI
  "mistral-large-latest":   { prompt: 2.00, completion: 6.00 },
  "mistral-medium-latest":  { prompt: 2.70, completion: 8.10 },
  "mistral-small-latest":   { prompt: 0.20, completion: 0.60 },
  "codestral-latest":       { prompt: 0.30, completion: 0.90 },
  "open-mistral-nemo":      { prompt: 0.15, completion: 0.15 },
  "ministral-8b-latest":    { prompt: 0.10, completion: 0.10 },
  // Cohere
  "command-r-plus":     { prompt: 2.50, completion: 10.00 },
  "command-r":          { prompt: 0.15, completion: 0.60 },
  "command-a":          { prompt: 2.50, completion: 10.00 },
};

/**
 * 根据模型名和 token 数量计算成本（美元）
 * 支持精确匹配和前缀匹配（如 "gpt-4o-2024-08-06" 匹配 "gpt-4o"）
 */
export function calculateCost(model, promptTokens, completionTokens) {
  if (!model || (!promptTokens && !completionTokens)) return 0;

  // 精确匹配
  let pricing = MODEL_PRICING[model];

  // 前缀匹配：按 key 长度降序查找最长匹配
  if (!pricing) {
    const keys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (model.startsWith(key)) {
        pricing = MODEL_PRICING[key];
        break;
      }
    }
  }

  if (!pricing) return 0;

  const promptCost = (promptTokens / 1_000_000) * pricing.prompt;
  const completionCost = (completionTokens / 1_000_000) * pricing.completion;
  // 保留 6 位小数精度
  return Math.round((promptCost + completionCost) * 1_000_000) / 1_000_000;
}

// --- 流式响应处理（将上游 SSE 转发，同时处理格式差异） ---
// 返回 { response, getUsage } — response 是 SSE Response，getUsage() 返回流结束后的 token 统计
export async function handleStreamRequest(upstreamUrl, upstreamHeaders, upstreamBody, providerType, model) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000); // 5 分钟超时

  // 对 OpenAI 兼容供应商，注入 stream_options 以获取流式 usage
  if (providerType !== "anthropic" && providerType !== "google") {
    upstreamBody.stream_options = { include_usage: true };
  }

  let upstreamResp;
  try {
    upstreamResp = await gatewayFetch(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
  clearTimeout(timeout);

  if (!upstreamResp.ok) {
    const errData = await upstreamResp.json().catch(() => ({}));
    const errMsg = errData?.error?.message || errData?.error || `上游返回 ${upstreamResp.status}`;
    throw new Error(errMsg);
  }

  // Anthropic 流式 → OpenAI 流式 转换
  if (providerType === "anthropic") {
    return convertAnthropicStream(upstreamResp, model);
  }

  // OpenAI 兼容格式 — 透传但拦截 usage chunk
  return convertOpenAICompatibleStream(upstreamResp, model);
}

// --- OpenAI 兼容流式转换（透传 + 拦截 usage） ---
function convertOpenAICompatibleStream(upstreamResp, model) {
  const reader = upstreamResp.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // 收集 usage 信息
  const usageData = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let buffer = "";

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          // 处理缓冲区中剩余内容
          if (buffer.trim()) {
            controller.enqueue(encoder.encode(buffer));
          }
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // 保留最后一个不完整的行
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) {
            // 保留空行（SSE 格式需要）
            controller.enqueue(encoder.encode(line + "\n"));
            continue;
          }
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            continue;
          }

          try {
            const chunk = JSON.parse(jsonStr);
            // 提取 usage（OpenAI 在最后一个 chunk 的 usage 字段返回）
            if (chunk.usage) {
              usageData.prompt_tokens = chunk.usage.prompt_tokens || 0;
              usageData.completion_tokens = chunk.usage.completion_tokens || 0;
              usageData.total_tokens = chunk.usage.total_tokens || 0;
            }
          } catch {
            // JSON 解析失败，不影响转发
          }

          // 原样转发
          controller.enqueue(encoder.encode(line + "\n"));
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  const response = new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...corsHeaders,
    },
  });

  // 附加 usage 获取方法到 response（通过自定义属性）
  response._streamUsage = usageData;
  return response;
}

// --- Anthropic 流式转换 ---
function convertAnthropicStream(upstreamResp, model) {
  const reader = upstreamResp.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // 收集 usage 信息
  const usageData = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let buffer = "";

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          // 发送 OpenAI 格式的 [DONE]
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            continue;
          }

          try {
            const evt = JSON.parse(jsonStr);
            // 转换 Anthropic SSE 事件为 OpenAI 格式
            if (evt.type === "content_block_delta") {
              const chunk = {
                id: `chatcmpl-${model}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: { content: evt.delta?.text || "" },
                  finish_reason: null,
                }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            } else if (evt.type === "message_delta") {
              // Anthropic message_delta 包含 usage
              if (evt.usage) {
                usageData.completion_tokens = evt.usage.output_tokens || 0;
                usageData.total_tokens = usageData.prompt_tokens + usageData.completion_tokens;
              }
              const chunk = {
                id: `chatcmpl-${model}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: {},
                  finish_reason: evt.delta?.stop_reason === "end_turn" ? "stop" : evt.delta?.stop_reason || "stop",
                }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            } else if (evt.type === "message_start") {
              // message_start 包含 input_tokens
              if (evt.message?.usage) {
                usageData.prompt_tokens = evt.message.usage.input_tokens || 0;
              }
            } else if (evt.type === "message_stop") {
              const chunk = {
                id: `chatcmpl-${model}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: {},
                  finish_reason: "stop",
                }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }
            // 其他事件类型忽略
          } catch {
            // 解析失败，跳过
          }
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  const response = new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...corsHeaders,
    },
  });

  // 附加 usage 获取方法到 response
  response._streamUsage = usageData;
  return response;
}
