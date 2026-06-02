export type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "azure"
  | "deepseek"
  | "moonshot"
  | "zhipu"
  | "baichuan"
  | "minimax"
  | "openrouter"
  | "modelscope"
  | "cloudflare"
  | "groq"
  | "siliconflow"
  | "iflytek"
  | "xai"
  | "mistral"
  | "cohere"
  | "custom";

export interface ProxyConfig {
  enabled: boolean;
  type: "none" | "socks5" | "http" | "https";
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

export interface ApiKeyEntry {
  key: string;
  name?: string; // 可选标签，如 "生产环境"、"测试"
  allowedModels?: string[]; // 允许调用的模型列表（空或不设表示无限制）；支持通配符如 "gpt-*"
}

export interface GatewayConfig {
  proxyUrl: string; // 自定义代理 URL，如 "https://your-proxy.com/proxy"
  apiKeys: string[]; // 保持兼容：纯 key 字符串数组
  apiKeyEntries?: ApiKeyEntry[]; // 带权限的 key 列表（优先使用）
}

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  models: string[];
  modelAliases?: Record<string, string>; // alias → model or provider/model, e.g. { "gpt4": "gpt-4o", "fast": "groq/llama-3.1-70b-versatile" }
  rateLimit?: number; // requests per minute
  proxy?: ProxyConfig; // 独立代理配置
  createdAt: string;
}

export interface UsageRecord {
  id: string;
  providerId: string;
  providerName: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: string;
  status: "success" | "error" | "rate_limited";
  latency: number; // ms
}

export interface RouteRouteFallbackCandidate {
  providerId: string; // 供应商 ID
  models: string[];   // 该供应商下可承载的模型列表
}

export interface RouteRule {
  id: string;
  name: string;
  mode: "pattern" | "fallback"; // 模式：pattern=正则匹配模型名，fallback=依次尝试供应商模型列表
  // pattern 模式字段
  pattern?: string; // e.g., "gpt-*"（mode=fallback 时不用）
  targetProviderId?: string; // 模式匹配的目标供应商（mode=fallback 时不用）
  // fallback 模式字段
  orderedCandidates?: RouteRouteFallbackCandidate[]; // 按优先顺序排列的候选供应商+模型
  priority?: number; // fallback 模式下按此数字排序
  enabled: boolean;
}

export interface DailyUsage {
  date: string;
  totalTokens: number;
  totalCost: number;
  requestCount: number;
  byProvider: Record<string, { tokens: number; cost: number; count: number }>;
}
