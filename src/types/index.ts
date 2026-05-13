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
  | "custom";

export interface ProxyConfig {
  enabled: boolean;
  type: "none" | "socks5" | "http" | "https";
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

export interface GatewayConfig {
  proxyUrl: string; // 自定义代理 URL，如 "https://your-proxy.com/proxy"
  apiKeys: string[];
}

export type ProviderAuthType = "api_key" | "oauth";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;       // 授权端点，如 https://accounts.google.com/o/oauth2/v2/auth
  tokenUrl: string;      // Token 交换端点，如 https://oauth2.googleapis.com/token
  scopes: string;        // 空格分隔的 scope 列表
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;  // ISO 时间戳，token 过期时间
}

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  authType?: ProviderAuthType; // 默认 "api_key"
  oauth?: OAuthConfig;         // authType === "oauth" 时使用
  enabled: boolean;
  models: string[];
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

export interface RouteRule {
  id: string;
  name: string;
  pattern: string; // e.g., "gpt-*"
  targetProviderId: string;
  priority: number;
  enabled: boolean;
}

export interface DailyUsage {
  date: string;
  totalTokens: number;
  totalCost: number;
  requestCount: number;
  byProvider: Record<string, { tokens: number; cost: number; count: number }>;
}
