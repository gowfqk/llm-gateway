import type { Provider, UsageRecord, RouteRule, DailyUsage } from "@/types";
import { subDays, format, startOfDay } from "date-fns";

// --- Provider Data ---
const defaultProviders: Provider[] = [
  {
    id: "openai-1",
    name: "OpenAI",
    type: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-***",
    enabled: true,
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o1-mini"],
    rateLimit: 500,
    createdAt: "2024-01-15T00:00:00Z",
  },
  {
    id: "anthropic-1",
    name: "Anthropic",
    type: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    apiKey: "sk-ant-***",
    enabled: true,
    models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-3-20241022"],
    rateLimit: 1000,
    createdAt: "2024-02-01T00:00:00Z",
  },
  {
    id: "google-1",
    name: "Google AI",
    type: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKey: "AIza***",
    enabled: true,
    models: ["gemini-2.0-flash", "gemini-2.0-pro"],
    rateLimit: 360,
    createdAt: "2024-03-10T00:00:00Z",
  },
  {
    id: "deepseek-1",
    name: "DeepSeek",
    type: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "sk-***",
    enabled: true,
    models: ["deepseek-chat", "deepseek-reasoner"],
    rateLimit: 200,
    createdAt: "2024-04-05T00:00:00Z",
  },
  {
    id: "openrouter-1",
    name: "OpenRouter",
    type: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "sk-or-***",
    enabled: true,
    models: ["meta-llama/llama-3.1-70b-instruct", "mistralai/mistral-large", "google/gemma-2-27b-it", "qwen/qwen-2.5-72b-instruct"],
    rateLimit: 300,
    createdAt: "2024-06-01T00:00:00Z",
  },
  {
    id: "modelscope-1",
    name: "魔塔社区 (ModelScope)",
    type: "modelscope",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: "sk-***",
    enabled: true,
    models: ["qwen-turbo", "qwen-plus", "qwen-max", "baichuan2-turbo"],
    rateLimit: 500,
    createdAt: "2024-06-15T00:00:00Z",
  },
  {
    id: "cloudflare-1",
    name: "Cloudflare AI",
    type: "cloudflare",
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai",
    apiKey: "CF_TOKEN_***",
    enabled: true,
    models: ["@cf/meta/llama-3.1-8b-instruct", "@cf/meta/llama-3.1-70b-instruct", "@cf/qwen/qwen1.5-14b-chat", "@cf/mistral/mistral-7b-instruct-v0.2"],
    rateLimit: 1000,
    createdAt: "2024-07-01T00:00:00Z",
  },
  {
    id: "groq-1",
    name: "Groq",
    type: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: "gsk_***",
    enabled: true,
    models: ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    rateLimit: 30,
    createdAt: "2024-07-10T00:00:00Z",
  },
  {
    id: "siliconflow-1",
    name: "硅基流动 (SiliconFlow)",
    type: "siliconflow",
    baseUrl: "https://api.siliconflow.cn/v1",
    apiKey: "sk-***",
    enabled: false,
    models: ["Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3", "THUDM/glm-4-9b-chat"],
    rateLimit: 200,
    createdAt: "2024-08-01T00:00:00Z",
  },
];

// --- Generate Mock Usage Data ---
function generateMockUsage(): UsageRecord[] {
  const records: UsageRecord[] = [];
  const models = [
    { model: "gpt-4o", provider: "openai-1", providerName: "OpenAI" },
    { model: "gpt-4o-mini", provider: "openai-1", providerName: "OpenAI" },
    { model: "claude-sonnet-4-20250514", provider: "anthropic-1", providerName: "Anthropic" },
    { model: "claude-opus-4-20250514", provider: "anthropic-1", providerName: "Anthropic" },
    { model: "gemini-2.0-flash", provider: "google-1", providerName: "Google AI" },
    { model: "deepseek-chat", provider: "deepseek-1", providerName: "DeepSeek" },
    { model: "moonshot-v1-32k", provider: "moonshot-1", providerName: "Moonshot (Kimi)" },
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
      id: `rec-${i}`,
      providerId: m.provider,
      providerName: m.providerName,
      model: m.model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost: Math.round(cost * 1000) / 1000,
      timestamp: date.toISOString(),
      status: statuses[Math.floor(Math.random() * statuses.length)],
      latency: Math.floor(Math.random() * 3000) + 100,
    });
  }

  return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function generateDailyUsage(): DailyUsage[] {
  const usage = generateMockUsage();
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
      if (!byProvider[r.providerId]) {
        byProvider[r.providerId] = { tokens: 0, cost: 0, count: 0 };
      }
      byProvider[r.providerId].tokens += r.totalTokens;
      byProvider[r.providerId].cost += r.cost;
      byProvider[r.providerId].count += 1;
    });

    days.push({
      date,
      totalTokens,
      totalCost: Math.round(totalCost * 1000) / 1000,
      requestCount: dayRecords.length,
      byProvider,
    });
  }

  return days;
}

const defaultRoutes: RouteRule[] = [
  { id: "route-1", name: "GPT 默认路由", pattern: "gpt-*", targetProviderId: "openai-1", priority: 1, enabled: true },
  { id: "route-2", name: "Claude 默认路由", pattern: "claude-*", targetProviderId: "anthropic-1", priority: 2, enabled: true },
  { id: "route-3", name: "Gemini 默认路由", pattern: "gemini-*", targetProviderId: "google-1", priority: 3, enabled: true },
  { id: "route-4", name: "DeepSeek 默认路由", pattern: "deepseek-*", targetProviderId: "deepseek-1", priority: 4, enabled: true },
];

// --- LocalStorage Helpers ---
const STORAGE_KEY_PROVIDERS = "llm-gateway-providers";
const STORAGE_KEY_USAGE = "llm-gateway-usage";
const STORAGE_KEY_ROUTES = "llm-gateway-routes";

export function getProviders(): Provider[] {
  const stored = localStorage.getItem(STORAGE_KEY_PROVIDERS);
  if (stored) return JSON.parse(stored);
  localStorage.setItem(STORAGE_KEY_PROVIDERS, JSON.stringify(defaultProviders));
  return defaultProviders;
}

export function saveProviders(providers: Provider[]) {
  localStorage.setItem(STORAGE_KEY_PROVIDERS, JSON.stringify(providers));
}

export function getUsageRecords(): UsageRecord[] {
  const stored = localStorage.getItem(STORAGE_KEY_USAGE);
  if (stored) return JSON.parse(stored);
  const data = generateMockUsage();
  localStorage.setItem(STORAGE_KEY_USAGE, JSON.stringify(data));
  return data;
}

export function getDailyUsage(): DailyUsage[] {
  return generateDailyUsage();
}

export function getRoutes(): RouteRule[] {
  const stored = localStorage.getItem(STORAGE_KEY_ROUTES);
  if (stored) return JSON.parse(stored);
  localStorage.setItem(STORAGE_KEY_ROUTES, JSON.stringify(defaultRoutes));
  return defaultRoutes;
}

export function saveRoutes(routes: RouteRule[]) {
  localStorage.setItem(STORAGE_KEY_ROUTES, JSON.stringify(routes));
}

export function generateId(prefix = "id"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
