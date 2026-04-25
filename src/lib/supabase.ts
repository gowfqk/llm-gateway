import { createClient } from "@supabase/supabase-js";
import type { Provider, UsageRecord, RouteRule, GatewayConfig } from "@/types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Supabase] 未配置环境变量，请在 .env 文件中设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。\n" +
    "数据将回退到浏览器 IndexedDB 本地存储。"
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");

export const TABLE_PROVIDERS = "providers";
export const TABLE_USAGE = "usage_records";
export const TABLE_ROUTES = "route_rules";
export const TABLE_GATEWAY_CONFIGS = "gateway_configs";

export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}

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
    createdAt: row.created_at as string,
  }));
}

export async function saveProvider(userId: string, provider: Provider): Promise<void> {
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
      created_at: provider.createdAt,
    });
    if (error) throw error;
  } catch (err: any) {
    // 如果 proxy_json 列不存在，尝试不使用该列保存
    if (err?.details?.includes('proxy_json')) {
      console.warn("[Supabase] proxy_json 列不存在，跳过代理配置保存");
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
