import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Provider, UsageRecord, RouteRule, GatewayConfig } from "@/types";
import { getRuntimeConfig, loadRuntimeConfig } from "./runtime-config";

// Supabase client 使用 Proxy 惰性初始化：
// - 模块加载期不创建 client，避免 URL/key 缺失时 createClient 抛异常导致白屏。
// - 首次访问属性时，从 runtime-config（/api/config 或 VITE_* build-time）取值并创建。
// - 若配置缺失，访问属性时抛出带明确说明的错误。
let _client: SupabaseClient | null = null;

function buildClient(): SupabaseClient {
  const cfg = getRuntimeConfig();
  if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new Error(
      "[Supabase] 未配置。请在 Cloudflare Pages 的环境变量中设置 " +
      "VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY（或 SUPABASE_URL / SUPABASE_ANON_KEY），" +
      "并重新部署。"
    );
  }
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop: string | symbol) {
    if (!_client) _client = buildClient();
    const value = (_client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as Function).bind(_client) : value;
  },
});

export const TABLE_PROVIDERS = "providers";
export const TABLE_USAGE = "usage_records";
export const TABLE_ROUTES = "route_rules";
export const TABLE_GATEWAY_CONFIGS = "gateway_configs";

/**
 * Supabase 是否已配置并可用。
 * 要求 loadRuntimeConfig() 已经 resolve 过（即 main.tsx 在 render 前已调用）。
 */
export function isSupabaseConfigured(): boolean {
  const cfg = getRuntimeConfig();
  return !!(cfg && cfg.supabaseUrl && cfg.supabaseAnonKey);
}

/** 重新导出，方便外部在启动时预加载配置 */
export { loadRuntimeConfig };

export async function fetchGatewayConfig(userId: string): Promise<GatewayConfig | null> {
  const { data, error } = await supabase
    .from(TABLE_GATEWAY_CONFIGS)
    .select("proxy_url, api_keys")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    proxyUrl: (data.proxy_url as string) || "",
    apiKeys: Array.isArray(data.api_keys) ? (data.api_keys as string[]) : [],
  };
}

export async function saveGatewayConfig(userId: string, config: GatewayConfig): Promise<void> {
  const { error } = await supabase.from(TABLE_GATEWAY_CONFIGS).upsert(
    {
      user_id: userId,
      proxy_url: config.proxyUrl,
      api_keys: config.apiKeys,
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
}

export async function fetchProviders(userId: string): Promise<Provider[]> {
  const { data, error } = await supabase
    .from(TABLE_PROVIDERS)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    type: row.type as Provider["type"],
    baseUrl: row.base_url as string,
    apiKey: row.api_key as string,
    enabled: row.enabled as boolean,
    models: (row.models as string[]) || [],
    rateLimit: row.rate_limit as number | undefined,
    // proxy_json 列可能不存在，使用 undefined 作为默认值
    proxy: (row.proxy_json as Provider["proxy"] | null) ?? undefined,
    // OAuth 字段
    authType: (row.auth_type as Provider["authType"]) || "api_key",
    oauth: row.oauth_config ? {
      ...(row.oauth_config as Record<string, unknown>),
      accessToken: row.oauth_access_token as string | undefined,
      refreshToken: row.oauth_refresh_token as string | undefined,
      tokenExpiry: row.oauth_token_expiry as string | undefined,
    } as Provider["oauth"] : undefined,
    createdAt: row.created_at as string,
  }));
}

export async function saveProvider(userId: string, provider: Provider): Promise<void> {
  // 构建 OAuth 配置对象（不包含 token，token 由后端 callback 管理）
  const oauthConfig = provider.oauth ? {
    clientId: provider.oauth.clientId,
    clientSecret: provider.oauth.clientSecret,
    authUrl: provider.oauth.authUrl,
    tokenUrl: provider.oauth.tokenUrl,
    scopes: provider.oauth.scopes,
  } : null;

  try {
    const { error } = await supabase.from(TABLE_PROVIDERS).upsert({
      id: provider.id,
      user_id: userId,
      name: provider.name,
      type: provider.type,
      base_url: provider.baseUrl,
      api_key: provider.apiKey,
      enabled: provider.enabled,
      models: provider.models,
      rate_limit: provider.rateLimit,
      proxy_json: provider.proxy ?? null,
      auth_type: provider.authType || "api_key",
      oauth_config: oauthConfig,
      created_at: provider.createdAt,
    });
    if (error) throw error;
  } catch (err: any) {
    // 如果新列不存在，尝试不使用这些列保存（向后兼容）
    if (err?.details?.includes('proxy_json') || err?.details?.includes('auth_type') || err?.details?.includes('oauth_config')) {
      console.warn("[Supabase] 部分列不存在，使用基础字段保存");
      const { error } = await supabase.from(TABLE_PROVIDERS).upsert({
        id: provider.id,
        user_id: userId,
        name: provider.name,
        type: provider.type,
        base_url: provider.baseUrl,
        api_key: provider.apiKey,
        enabled: provider.enabled,
        models: provider.models,
        rate_limit: provider.rateLimit,
        created_at: provider.createdAt,
      });
      if (error) throw error;
    } else {
      throw err;
    }
  }
}

export async function deleteProvider(userId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE_PROVIDERS)
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function fetchUsageRecords(userId: string): Promise<UsageRecord[]> {
  const { data, error } = await supabase
    .from(TABLE_USAGE)
    .select("*")
    .eq("user_id", userId)
    .order("timestamp", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    providerId: row.provider_id as string,
    providerName: row.provider_name as string,
    model: row.model as string,
    promptTokens: row.prompt_tokens as number,
    completionTokens: row.completion_tokens as number,
    totalTokens: row.total_tokens as number,
    cost: row.cost as number,
    timestamp: row.timestamp as string,
    status: row.status as UsageRecord["status"],
    latency: row.latency as number,
  }));
}

export async function saveUsageRecord(userId: string, record: UsageRecord): Promise<void> {
  const { error } = await supabase.from(TABLE_USAGE).upsert({
    id: record.id,
    user_id: userId,
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
  });
  if (error) throw error;
}

export async function fetchRoutes(userId: string): Promise<RouteRule[]> {
  const { data, error } = await supabase
    .from(TABLE_ROUTES)
    .select("*")
    .eq("user_id", userId)
    .order("priority", { ascending: true });
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    pattern: row.pattern as string,
    targetProviderId: row.target_provider_id as string,
    priority: row.priority as number,
    enabled: row.enabled as boolean,
  }));
}

export async function saveRoute(userId: string, route: RouteRule): Promise<void> {
  const { error } = await supabase.from(TABLE_ROUTES).upsert({
    id: route.id,
    user_id: userId,
    name: route.name,
    pattern: route.pattern,
    target_provider_id: route.targetProviderId,
    priority: route.priority,
    enabled: route.enabled,
  });
  if (error) throw error;
}

export async function deleteRoute(userId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE_ROUTES)
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function batchSaveProviders(userId: string, providers: Provider[]): Promise<void> {
  if (providers.length === 0) return;
  const { error } = await supabase.from(TABLE_PROVIDERS).upsert(
    providers.map((p) => ({
      id: p.id,
      user_id: userId,
      name: p.name,
      type: p.type,
      base_url: p.baseUrl,
      api_key: p.apiKey,
      enabled: p.enabled,
      models: p.models,
      rate_limit: p.rateLimit,
      proxy_json: p.proxy ?? null,
      auth_type: p.authType || "api_key",
      oauth_config: p.oauth ? {
        clientId: p.oauth.clientId,
        clientSecret: p.oauth.clientSecret,
        authUrl: p.oauth.authUrl,
        tokenUrl: p.oauth.tokenUrl,
        scopes: p.oauth.scopes,
      } : null,
      created_at: p.createdAt,
    }))
  );
  if (error) throw error;
}

export async function batchSaveRoutes(userId: string, routes: RouteRule[]): Promise<void> {
  if (routes.length === 0) return;
  const { error } = await supabase.from(TABLE_ROUTES).upsert(
    routes.map((r) => ({
      id: r.id,
      user_id: userId,
      name: r.name,
      pattern: r.pattern,
      target_provider_id: r.targetProviderId,
      priority: r.priority,
      enabled: r.enabled,
    }))
  );
  if (error) throw error;
}


export async function clearUsageRecords(userId: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE_USAGE)
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}
