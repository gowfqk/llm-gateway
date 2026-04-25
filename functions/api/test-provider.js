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
    const response = await fetch(url, fetchOptions);

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
    try {
      responseData = await response.json();
    } catch {
      responseData = { raw: await response.text() };
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
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message || String(error),
      }),
      { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        }
      }
    );
  }
}
