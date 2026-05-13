/**
 * GET /api/oauth-callback — OAuth Authorization Code 回调端点
 *
 * 接收授权码，交换 access_token 和 refresh_token，存入 Supabase providers 表。
 * 回调完成后重定向回前端页面。
 */

import { corsHeaders } from "../_shared/lib.js";

function getSupabaseConfig(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || "";
  return { url, key };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // state = providerId
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // 错误处理：OAuth 供应商返回了错误
  if (error) {
    return redirectToFrontend(url, state, `OAuth 错误: ${error} - ${errorDescription || "未知错误"}`);
  }

  if (!code || !state) {
    return redirectToFrontend(url, state, "缺少 code 或 state 参数");
  }

  const providerId = state;

  try {
    // 1. 从 Supabase 获取 provider 的 OAuth 配置
    const { url: supabaseUrl, key: serviceKey } = getSupabaseConfig(env);
    if (!supabaseUrl || !serviceKey) {
      return redirectToFrontend(url, providerId, "Supabase 未配置");
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
      return redirectToFrontend(url, providerId, `查询供应商失败: HTTP ${providerResp.status}`);
    }

    const providers = await providerResp.json();
    if (!providers || providers.length === 0) {
      return redirectToFrontend(url, providerId, "未找到该供应商");
    }

    const provider = providers[0];
    const oauthConfig = provider.oauth_config;

    if (!oauthConfig || !oauthConfig.tokenUrl || !oauthConfig.clientId || !oauthConfig.clientSecret) {
      return redirectToFrontend(url, providerId, "供应商 OAuth 配置不完整");
    }

    // 2. 用授权码交换 token
    const redirectUri = buildRedirectUri(url);
    const tokenResp = await fetch(oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: oauthConfig.clientId,
        client_secret: oauthConfig.clientSecret,
      }).toString(),
    });

    if (!tokenResp.ok) {
      const errBody = await tokenResp.text().catch(() => "");
      return redirectToFrontend(url, providerId, `Token 交换失败: HTTP ${tokenResp.status} - ${errBody}`);
    }

    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in; // 秒
    const tokenExpiry = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    if (!accessToken) {
      return redirectToFrontend(url, providerId, "Token 响应中缺少 access_token");
    }

    // 3. 将 token 存入 Supabase
    const updateResp = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/providers?id=eq.${encodeURIComponent(providerId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          oauth_access_token: accessToken,
          oauth_refresh_token: refreshToken,
          oauth_token_expiry: tokenExpiry,
        }),
      }
    );

    if (!updateResp.ok) {
      return redirectToFrontend(url, providerId, `保存 Token 失败: HTTP ${updateResp.status}`);
    }

    // 4. 成功，重定向回前端
    return redirectToFrontend(url, providerId, null);
  } catch (err) {
    return redirectToFrontend(url, providerId, `服务器错误: ${err.message}`);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// --- 工具函数 ---

function buildRedirectUri(requestUrl) {
  return `${requestUrl.origin}/api/oauth-callback`;
}

function redirectToFrontend(requestUrl, providerId, error) {
  const frontendUrl = new URL("/", requestUrl.origin);
  frontendUrl.searchParams.set("page", "providers");
  if (providerId) frontendUrl.searchParams.set("provider_id", providerId);
  if (error) {
    frontendUrl.searchParams.set("oauth_error", error);
  } else {
    frontendUrl.searchParams.set("oauth_success", "true");
  }
  return Response.redirect(frontendUrl.toString(), 302);
}
