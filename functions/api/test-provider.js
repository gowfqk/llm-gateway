/**
 * POST /api/test-provider — 后端代理测试 API 连接
 * 用于绕过浏览器 CORS 限制
 */
export async function onRequestPost(context) {
  const { request } = context;
  
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };

  // Handle preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  try {
    const { url, headers: clientHeaders, body, providerName } = await request.json();

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

    const startTime = Date.now();
    
    // Make the actual request to the provider API (server-side, no CORS)
    const response = await fetch(url, {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify(body),
    });

    const latency = Date.now() - startTime;

    // Read response body
    let responseData;
    try {
      responseData = await response.json();
    } catch {
      responseData = { raw: await response.text() };
    }

    return new Response(
      JSON.stringify({
        ok: response.ok,
        status: response.status,
        latency,
        data: responseData,
      }),
      { 
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message,
        latency: Date.now() - startTime 
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
