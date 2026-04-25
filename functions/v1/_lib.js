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
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: { message, type: "invalid_request_error" } }, status);
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

async function validateGatewayApiKey(apiKey, env) {
  if (!apiKey) return { isValid: false, userId: null };
  
  const staticKeys = parseStaticGatewayKeys(env);
  if (staticKeys.includes(apiKey)) {
    // 静态密钥无法关联到特定用户，返回 null
    return { isValid: true, userId: null };
  }

  const supabaseUrl = env?.SUPABASE_URL;
  const serviceRoleKey = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return { isValid: false, userId: null };

  // 支持两种格式：gw_live_sk_xxx 和 {gw_live_sk_xxx}
  // 先尝试带花括号的格式（兼容旧数据）
  const queryValueWithBraces = encodeURIComponent(`{${apiKey}}`);
  const urlWithBraces = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/gateway_configs?select=user_id&api_keys=cs.${queryValueWithBraces}&limit=1`;
  
  try {
    const response = await fetch(urlWithBraces, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const rows = await response.json().catch(() => []);
      if (Array.isArray(rows) && rows.length > 0) {
        return { isValid: true, userId: rows[0].user_id };
      }
    }
  } catch (e) {
    console.error("[Gateway auth] lookup (with braces) failed:", e);
  }

  // 如果不带花括号的格式，尝试直接匹配
  const queryValueWithoutBraces = encodeURIComponent(apiKey);
  const urlWithoutBraces = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/gateway_configs?select=user_id&api_keys=cs.${queryValueWithoutBraces}&limit=1`;
  
  const response = await fetch(urlWithoutBraces, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Gateway auth lookup failed: HTTP ${response.status}`);
  }

  const rows = await response.json().catch(() => []);
  if (Array.isArray(rows) && rows.length > 0) {
    return { isValid: true, userId: rows[0].user_id };
  }
  
  return { isValid: false, userId: null };
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
    return { isValid: true, userId: null };
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

// --- 根据模型名找到目标供应商 ---
export function resolveProvider(model, providers, routes) {
  // 1. 先匹配路由规则（按优先级）
  for (const route of routes) {
    if (matchPattern(route.pattern, model)) {
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

// --- 构建上游请求 URL ---
export function buildUpstreamUrl(provider, model) {
  let base = provider.base_url.replace(/\/+$/, "");
  
  // Anthropic 特殊处理
  if (provider.type === "anthropic") {
    return `${base}/messages`;
  }
  
  // Google AI 特殊处理
  if (provider.type === "google") {
    return `${base}/models/${model}:generateContent`;
  }

  // OpenAI 兼容（绝大多数供应商）
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
    default:
      // OpenAI 兼容格式
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
    return {
      contents,
      ...(body.temperature !== undefined ? { generationConfig: { temperature: body.temperature } } : {}),
      ...(body.max_tokens !== undefined ? { generationConfig: { maxOutputTokens: body.max_tokens } } : {}),
    };
  }

  // OpenAI 兼容格式 — 直接透传
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

// --- 记录使用日志到 Supabase ---
export async function logUsage(env, record) {
  const { url, key } = getSupabaseConfig(env);
  if (!url || !key) {
    console.warn("[logUsage] Supabase 未配置，跳过日志记录");
    return;
  }

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
        cost: record.cost,
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

// --- 流式响应处理（将上游 SSE 转发，同时处理格式差异） ---
export async function handleStreamRequest(upstreamUrl, upstreamHeaders, upstreamBody, providerType, model) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000); // 5 分钟超时

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

  // OpenAI 兼容格式 — 直接透传
  // 直接返回上游 ReadableStream
  return new Response(upstreamResp.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...corsHeaders,
    },
  });
}

// --- Anthropic 流式转换 ---
async function convertAnthropicStream(upstreamResp, model) {
  const reader = upstreamResp.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

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

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

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

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...corsHeaders,
    },
  });
}
