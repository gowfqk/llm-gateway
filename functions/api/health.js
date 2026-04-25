/**
 * GET /api/health — 健康检查
 */
export async function onRequestGet(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  return new Response(
    JSON.stringify({
      status: "ok",
      platform: "cloudflare-pages",
      timestamp: new Date().toISOString(),
    }),
    {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }
  );
}

/**
 * OPTIONS /api/health — CORS preflight
 */
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
