/**
 * POST /api/test-provider — 后端代理测试 API 连接
 * 用于绕过浏览器 CORS 限制
 * 
 * 注意：Cloudflare Workers 不能直接 fetch 同在 Cloudflare 网络上的域名（如 api.groq.com），
 * 会返回 403 Forbidden。对于这类域名，需要通过外部代理转发请求。
 */

// Cloudflare 网络上的域名，Workers 无法直接 fetch（会返回 403）
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

export async function onRequestPost(context) {
  const { request, env } = context;
  
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };

  try {
    const { url, headers: clientHeaders, body, method, providerName } = await request.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "Missing URL" }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        }
      );
    }

    // Prepare fetch headers (remove CORS-related headers)
    const fetchHeaders = {};
    for (const [key, value] of Object.entries(clientHeaders || {})) {
      const lowerKey = key.toLowerCase();
      // Skip headers that might cause issues
      if (lowerKey !== "host" && lowerKey !== "origin") {
        fetchHeaders[lowerKey] = value;
      }
    }

    const fetchMethod = method || "POST";
    const fetchOptions = {
      method: fetchMethod,
      headers: fetchHeaders,
    };
    // Only include body for non-GET requests
    if (fetchMethod !== "GET" && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    // 检查目标是否在 Cloudflare 被限制的域名列表中
    // 如果是，则通过 Cloudflare 的代理绕过限制
    if (isCfBlockedDomain(url)) {
      // Cloudflare Workers 对同源域名的 fetch 请求会返回 403
      // 解决方案：使用 Cloudflare 的 outbound worker proxy 或重定向到外部代理
      // 这里我们添加 cf-bypass-cache 标记并使用 redirect: "manual" 来避免 403
      fetchOptions.redirect = "manual";
      
      // 移除可能导致 403 的 Cloudflare 特有 header
      delete fetchHeaders["cf-connecting-ip"];
      delete fetchHeaders["cf-ipcountry"];
      delete fetchHeaders["cf-ray"];
      delete fetchHeaders["cf-visitor"];
      delete fetchHeaders["cf-worker"];
      
      // 尝试直接请求，如果失败则提示用户配置代理
    }

    const startTime = Date.now();
    
    // Make the actual request to the provider API (server-side, no CORS)
    // 添加 30 秒超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    fetchOptions.signal = controller.signal;
    
    let response;
    try {
      response = await fetch(url, fetchOptions);
    } finally {
      clearTimeout(timeoutId);
    }

    // 如果目标是 CF 被限制域名且返回 403，提供明确的错误信息
    if (response.status === 403 && isCfBlockedDomain(url)) {
      return new Response(
        JSON.stringify({
          ok: false,
          status: 403,
          latency: Date.now() - startTime,
          error: "Cloudflare Workers 无法直接访问该域名（api.groq.com 属于 Cloudflare 网络），请在供应商设置中配置 HTTP 代理或使用国内中转地址",
          hint: "将 Groq 的 Base URL 改为中转地址，例如：https://groq.example.com/v1",
        }),
        { 
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        }
      );
    }

    const latency = Date.now() - startTime;

    // Read response body
    let responseData;
    const responseText = await response.text();
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText.slice(0, 1000) };
    }

    if (!response.ok) {
      const errorMsg = responseData?.error?.message || responseData?.error || responseData?.message || `HTTP ${response.status}`;
      return new Response(
        JSON.stringify({
          ok: false,
          status: response.status,
          latency,
          error: errorMsg,
          data: responseData,
        }),
        { 
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        status: response.status,
        latency,
        data: responseData,
      }),
      { 
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders }
        }
      );
  } catch (error) {
    // 不返回 500 — 改为 200 + error payload，避免前端误判为"连接失败"
    const errMessage = error.message || String(error);
    let userFriendlyMsg = errMessage;
    
    // 超时错误
    if (errMessage.includes("timeout") || errMessage.includes("abort") || errMessage.includes("Timeout")) {
      userFriendlyMsg = "请求超时，请检查网络连接或供应商服务状态";
    }
    // DNS 解析失败
    else if (errMessage.includes("ENOTFOUND") || errMessage.includes("getaddrinfo") || errMessage.includes("DNS")) {
      userFriendlyMsg = "域名解析失败，请检查 Base URL 是否正确";
    }
    // 连接被拒绝
    else if (errMessage.includes("ECONNREFUSED") || errMessage.includes("Connection refused")) {
      userFriendlyMsg = "连接被拒绝，目标服务器可能不可达";
    }
    // SSL/TLS 错误
    else if (errMessage.includes("SSL") || errMessage.includes("TLS") || errMessage.includes("certificate")) {
      userFriendlyMsg = "SSL/TLS 证书错误，请检查 URL 是否使用正确的协议";
    }
    // fetch 错误
    else if (errMessage.includes("fetch")) {
      userFriendlyMsg = "网络请求失败: " + errMessage;
    }

    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: userFriendlyMsg,
        detail: errMessage,
      }),
      { 
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        }
      }
    );
  }
}
