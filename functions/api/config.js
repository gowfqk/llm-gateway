/**
 * GET /api/config — 运行时配置
 *
 * 从 Cloudflare Pages 的 Runtime 环境变量读取 Supabase 等前端必需的配置，
 * 让前端在应用启动时拉取，避免依赖 Vite 构建期的 VITE_* 变量注入。
 *
 * 安全说明：只返回 anon key（设计上就是公开给浏览器使用的），
 * 绝不返回 SUPABASE_SERVICE_ROLE_KEY 等服务端密钥。
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function onRequestGet(context) {
  const { env } = context;

  // 优先读 VITE_ 前缀（和前端 .env 保持一致），再读裸名（Runtime 习惯）
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
  const demoEmail = env.VITE_DEMO_EMAIL || env.DEMO_EMAIL || "";

  return new Response(
    JSON.stringify({
      supabase: {
        url: supabaseUrl,
        anonKey: supabaseAnonKey,
        configured: Boolean(supabaseUrl && supabaseAnonKey),
      },
      demo: {
        email: demoEmail,
      },
    }),
    {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }
  );
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
