/**
 * POST /api/oauth-authorize — 发起 OAuth 授权流程
 *
 * 前端传入 providerId，后端从 Supabase 读取该供应商的 OAuth 配置，
 * 构建授权 URL 并返回给前端，前端再跳转到该 URL。
 *
 * Request body: { providerId: string }
 * Response: { authorizeUrl: string }
 */

import { corsHeaders, jsonResponse, errorResponse } from "../_shared/lib.js";

function getSupabaseConfig(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || "";
  return { url, key };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("请求体解析失败", 400);
  }

  const { providerId } = body;
  if (!providerId) {
    return errorResponse("缺少 providerId", 400);
  }

  try {
    // 1. 从 Supabase 获取 provider 的 OAuth 配置
    const { url: supabaseUrl, key: serviceKey } = getSupabaseConfig(env);
    if (!supabaseUrl || !serviceKey) {
      return errorResponse("Supabase 未配置", 500);
    }

    const providerResp = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/providers?id=eq.${encodeURIComponent(providerId)}&select=*&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept: "application/json",
        },
      }
    );

    if (!providerResp.ok) {
      return errorResponse(`查询供应商失败: HTTP ${providerResp.status}`, 500);
    }

    const providers = await providerResp.json();
    if (!providers || providers.length === 0) {
      return errorResponse("未找到该供应商", 404);
    }

    const provider = providers[0];
    const oauthConfig = provider.oauth_config;

    if (!oauthConfig || !oauthConfig.authUrl || !oauthConfig.clientId) {
      return errorResponse("供应商 OAuth 配置不完整（缺少 authUrl 或 clientId）", 400);
    }

    // 2. 构建授权 URL
    const requestUrl = new URL(request.url);
    const redirectUri = `${requestUrl.origin}/api/oauth-callback`;

    const authUrl = new URL(oauthConfig.authUrl);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", oauthConfig.clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", providerId); // state 传 providerId，回调时用于关联
    if (oauthConfig.scopes) {
      authUrl.searchParams.set("scope", oauthConfig.scopes);
    }
    // 请求 offline access 以获取 refresh_token
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");

    return jsonResponse({ authorizeUrl: authUrl.toString() });
  } catch (err) {
    return errorResponse(`服务器错误: ${err.message}`, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
