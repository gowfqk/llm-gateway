import type { Provider, UsageRecord, RouteRule, DailyUsage, GatewayConfig } from "@/types";
import { subDays, format, startOfDay } from "date-fns";
import { kv } from "./kv";
import {
  isSupabaseConfigured,
  fetchProviders as supaFetchProviders,
  saveProvider as supaSaveProvider,
  deleteProvider as supaDeleteProvider,
  fetchUsageRecords as supaFetchUsage,
  clearUsageRecords as supaClearUsage,
  fetchRoutes as supaFetchRoutes,
  saveRoute as supaSaveRoute,
  deleteRoute as supaDeleteRoute,
  batchSaveProviders as supaBatchSaveProviders,
  batchSaveRoutes as supaBatchSaveRoutes,
} from "./supabase";
import { generateId } from "./mock-data";
import { getCurrentUser } from "./auth";
import { loadGatewayConfig, saveGatewayConfig } from "./gateway-config";

// --- Default seed data ---
const defaultProviders: Provider[] = [
  {
    id: "openai-1", name: "OpenAI", type: "openai",
    baseUrl: "https://api.openai.com/v1", apiKey: "sk-***",
    enabled: true, models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o1-mini"],
    rateLimit: 500, createdAt: "2024-01-15T00:00:00Z",
  },
  {
    id: "anthropic-1", name: "Anthropic", type: "anthropic",
    baseUrl: "https://api.anthropic.com/v1", apiKey: "sk-ant-***",
    enabled: true, models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-3-20241022"],
    rateLimit: 1000, createdAt: "2024-02-01T00:00:00Z",
  },
  {
    id: "google-1", name: "Google AI", type: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta", apiKey: "AIza***",
    enabled: true, models: ["gemini-2.0-flash", "gemini-2.0-pro"],
    rateLimit: 360, createdAt: "2024-03-10T00:00:00Z",
  },
  {
    id: "deepseek-1", name: "DeepSeek", type: "deepseek",
    baseUrl: "https://api.deepseek.com/v1", apiKey: "sk-***",
    enabled: true, models: ["deepseek-chat", "deepseek-reasoner"],
    rateLimit: 200, createdAt: "2024-04-05T00:00:00Z",
  },
  {
    id: "openrouter-1", name: "OpenRouter", type: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-or-***",
    enabled: true, models: ["meta-llama/llama-3.1-70b-instruct", "mistralai/mistral-large", "google/gemma-2-27b-it", "qwen/qwen-2.5-72b-instruct"],
    rateLimit: 300, createdAt: "2024-06-01T00:00:00Z",
  },
  {
    id: "modelscope-1", name: "魔塔社区 (ModelScope)", type: "modelscope",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKey: "sk-***",
    enabled: true, models: ["qwen-turbo", "qwen-plus", "qwen-max", "baichuan2-turbo"],
    rateLimit: 500, createdAt: "2024-06-15T00:00:00Z",
  },
  {
    id: "cloudflare-1", name: "Cloudflare AI", type: "cloudflare",
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai", apiKey: "CF_TOKEN_***",
    enabled: true, models: ["@cf/meta/llama-3.1-8b-instruct", "@cf/meta/llama-3.1-70b-instruct", "@cf/qwen/qwen1.5-14b-chat", "@cf/mistral/mistral-7b-instruct-v0.2"],
    rateLimit: 1000, createdAt: "2024-07-01T00:00:00Z",
  },
  {
    id: "groq-1", name: "Groq", type: "groq",
    baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_***",
    enabled: true, models: ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    rateLimit: 30, createdAt: "2024-07-10T00:00:00Z",
  },
  {
    id: "siliconflow-1", name: "硅基流动 (SiliconFlow)", type: "siliconflow",
    baseUrl: "https://api.siliconflow.cn/v1", apiKey: "sk-***",
    enabled: false, models: ["Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3", "THUDM/glm-4-9b-chat"],
    rateLimit: 200, createdAt: "2024-08-01T00:00:00Z",
  },
];

const defaultRoutes: RouteRule[] = [
  { id: "route-1", name: "GPT 默认路由", pattern: "gpt-*", targetProviderId: "openai-1", priority: 1, enabled: true },
  { id: "route-2", name: "Claude 默认路由", pattern: "claude-*", targetProviderId: "anthropic-1", priority: 2, enabled: true },
  { id: "route-3", name: "Gemini 默认路由", pattern: "gemini-*", targetProviderId: "google-1", priority: 3, enabled: true },
  { id: "route-4", name: "DeepSeek 默认路由", pattern: "deepseek-*", targetProviderId: "deepseek-1", priority: 4, enabled: true },
];

function generateMockUsage(): UsageRecord[] {
  const records: UsageRecord[] = [];
  const models = [
    { model: "gpt-4o", provider: "openai-1", providerName: "OpenAI" },
    { model: "gpt-4o-mini", provider: "openai-1", providerName: "OpenAI" },
    { model: "claude-sonnet-4-20250514", provider: "anthropic-1", providerName: "Anthropic" },
    { model: "claude-opus-4-20250514", provider: "anthropic-1", providerName: "Anthropic" },
    { model: "gemini-2.0-flash", provider: "google-1", providerName: "Google AI" },
    { model: "deepseek-chat", provider: "deepseek-1", providerName: "DeepSeek" },
    { model: "meta-llama/llama-3.1-70b-instruct", provider: "openrouter-1", providerName: "OpenRouter" },
    { model: "llama-3.1-70b-versatile", provider: "groq-1", providerName: "Groq" },
  ];
  const statuses: UsageRecord["status"][] = ["success", "success", "success", "success", "success", "error", "rate_limited"];

  for (let i = 0; i < 300; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const date = subDays(new Date(), daysAgo);
    const m = models[Math.floor(Math.random() * models.length)];
    const promptTokens = Math.floor(Math.random() * 8000) + 100;
    const completionTokens = Math.floor(Math.random() * 4000) + 50;
    const pricePer1K = 0.002 + Math.random() * 0.02;
    const cost = ((promptTokens + completionTokens) / 1000) * pricePer1K;
    records.push({
      id: `rec-${i}`, providerId: m.provider, providerName: m.providerName,
      model: m.model, promptTokens, completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost: Math.round(cost * 1000) / 1000, timestamp: date.toISOString(),
      status: statuses[Math.floor(Math.random() * statuses.length)],
      latency: Math.floor(Math.random() * 3000) + 100,
    });
  }
  return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// --- 获取 Supabase Auth userId ---
async function getSupabaseUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const user = await getCurrentUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

// --- 统一数据层：Supabase 优先（基于 Auth），IndexedDB 回退 ---

export async function loadProviders(): Promise<Provider[]> {
  const userId = await getSupabaseUserId();

  // Supabase 路径
  if (userId) {
    try {
      const data = await supaFetchProviders(userId);
      if (data.length > 0) {
        // 同步到 IndexedDB
        const storageKey = `providers:${userId}`;
        await kv.set(storageKey, data);
        return data;
      }
      // Supabase 返回空数组，继续检查 IndexedDB
    } catch {
      // Supabase 出错，继续检查 IndexedDB
    }
  }

  // IndexedDB fallback（按 userId 隔离）
  const storageKey = userId ? `providers:${userId}` : "providers";
  const stored = await kv.get<Provider[]>(storageKey);
  if (stored && stored.length > 0) return stored;

  // 首次使用，写入默认数据
  await kv.set(storageKey, defaultProviders);
  return defaultProviders;
}

export async function saveProviderData(provider: Provider): Promise<void> {
  const userId = await getSupabaseUserId();

  if (userId) {
    try {
      await supaSaveProvider(userId, provider);
      console.log(`[saveProviderData] 成功保存到 Supabase: ${provider.id}`);
    } catch (error) {
      console.error(`[saveProviderData] 保存到 Supabase 失败:`, error);
      // 继续保存到 IndexedDB
    }
  }

  const storageKey = userId ? `providers:${userId}` : "providers";
  const existing = await kv.get<Provider[]>(storageKey) || [];
  const idx = existing.findIndex((p) => p.id === provider.id);
  if (idx >= 0) existing[idx] = provider; else existing.push(provider);
  await kv.set(storageKey, existing);
  console.log(`[saveProviderData] 已保存到 IndexedDB: ${provider.id}`);
}

export async function deleteProviderData(id: string): Promise<void> {
  const userId = await getSupabaseUserId();

  if (userId) {
    try { await supaDeleteProvider(userId, id); } catch { /* fallback */ }
  }

  const storageKey = userId ? `providers:${userId}` : "providers";
  const existing = await kv.get<Provider[]>(storageKey) || [];
  await kv.set(storageKey, existing.filter((p) => p.id !== id));
}

export async function loadUsageRecords(): Promise<UsageRecord[]> {
  const userId = await getSupabaseUserId();

  if (userId) {
    try {
      const data = await supaFetchUsage(userId);
      if (data.length > 0) {
        await kv.set(`usage:${userId}`, data);
        return data;
      }
      // Supabase 返回空数组，继续检查 IndexedDB
    } catch {
      // Supabase 出错，继续检查 IndexedDB
    }
  }

  const storageKey = userId ? `usage:${userId}` : "usage";
  const stored = await kv.get<UsageRecord[]>(storageKey);
  if (Array.isArray(stored)) return stored;

  const data = generateMockUsage();
  await kv.set(storageKey, data);
  return data;
}

export async function loadRoutes(): Promise<RouteRule[]> {
  const userId = await getSupabaseUserId();

  if (userId) {
    try {
      const data = await supaFetchRoutes(userId);
      if (data.length > 0) {
        // 同步到 IndexedDB
        const storageKey = `routes:${userId}`;
        await kv.set(storageKey, data);
        return data;
      }
      // Supabase 返回空数组，继续检查 IndexedDB
    } catch {
      // Supabase 出错，继续检查 IndexedDB
    }
  }

  const storageKey = userId ? `routes:${userId}` : "routes";
  const stored = await kv.get<RouteRule[]>(storageKey);
  if (stored && stored.length > 0) return stored;

  await kv.set(storageKey, defaultRoutes);
  return defaultRoutes;
}

export async function saveRouteData(route: RouteRule): Promise<void> {
  const userId = await getSupabaseUserId();

  if (userId) {
    try { await supaSaveRoute(userId, route); } catch { /* fallback */ }
  }

  const storageKey = userId ? `routes:${userId}` : "routes";
  const existing = await kv.get<RouteRule[]>(storageKey) || [];
  const idx = existing.findIndex((r) => r.id === route.id);
  if (idx >= 0) existing[idx] = route; else existing.push(route);
  await kv.set(storageKey, existing);
}

export async function deleteRouteData(id: string): Promise<void> {
  const userId = await getSupabaseUserId();

  if (userId) {
    try { await supaDeleteRoute(userId, id); } catch { /* fallback */ }
  }

  const storageKey = userId ? `routes:${userId}` : "routes";
  const existing = await kv.get<RouteRule[]>(storageKey) || [];
  await kv.set(storageKey, existing.filter((r) => r.id !== id));
}

export function computeDailyUsage(usage: UsageRecord[]): DailyUsage[] {
  const days: DailyUsage[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = format(startOfDay(subDays(new Date(), i)), "yyyy-MM-dd");
    const dayRecords = usage.filter((r) => format(new Date(r.timestamp), "yyyy-MM-dd") === date);
    const byProvider: Record<string, { tokens: number; cost: number; count: number }> = {};
    let totalTokens = 0;
    let totalCost = 0;
    dayRecords.forEach((r) => {
      totalTokens += r.totalTokens;
      totalCost += r.cost;
      if (!byProvider[r.providerId]) byProvider[r.providerId] = { tokens: 0, cost: 0, count: 0 };
      byProvider[r.providerId].tokens += r.totalTokens;
      byProvider[r.providerId].cost += r.cost;
      byProvider[r.providerId].count += 1;
    });
    days.push({ date, totalTokens, totalCost: Math.round(totalCost * 1000) / 1000, requestCount: dayRecords.length, byProvider });
  }
  return days;
}

export async function exportConfigurationData(): Promise<Record<string, unknown>> {
  const [providers, routes, gatewayConfig] = await Promise.all([
    loadProviders(),
    loadRoutes(),
    loadGatewayConfig(),
  ]);

  return {
    providers,
    routes,
    gatewayConfig,
  };
}

export async function importConfigurationData(data: Record<string, unknown>): Promise<void> {
  const userId = await getSupabaseUserId();
  const providersKey = userId ? `providers:${userId}` : "providers";
  const routesKey = userId ? `routes:${userId}` : "routes";

  const providers = Array.isArray(data.providers) ? (data.providers as Provider[]) : [];
  const routes = Array.isArray(data.routes) ? (data.routes as RouteRule[]) : [];
  const gatewayConfig = (data.gatewayConfig ?? null) as GatewayConfig | null;

  await kv.set(providersKey, providers);
  await kv.set(routesKey, routes);

  if (userId) {
    await Promise.all([
      supaBatchSaveProviders(userId, providers),
      supaBatchSaveRoutes(userId, routes),
    ]);
  }

  if (gatewayConfig) {
    await saveGatewayConfig(gatewayConfig);
  }
}

export async function clearUsageLogs(): Promise<void> {
  const userId = await getSupabaseUserId();
  const storageKey = userId ? `usage:${userId}` : "usage";

  if (userId) {
    try {
      await supaClearUsage(userId);
    } catch {
      // fallback to local cache only
    }
  }

  await kv.set(storageKey, []);
}

export { generateId };
