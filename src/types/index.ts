     1|export type ProviderType =
     2|  | "openai"
     3|  | "anthropic"
     4|  | "google"
     5|  | "azure"
     6|  | "deepseek"
     7|  | "moonshot"
     8|  | "zhipu"
     9|  | "baichuan"
    10|  | "minimax"
    11|  | "openrouter"
    12|  | "modelscope"
    13|  | "cloudflare"
    14|  | "groq"
    15|  | "siliconflow"
    16|  | "iflytek"
    17|  | "xai"
    18|  | "mistral"
    19|  | "cohere"
    20|  | "custom";
    21|
    22|export interface ProxyConfig {
    23|  enabled: boolean;
    24|  type: "none" | "socks5" | "http" | "https";
    25|  host?: string;
    26|  port?: number;
    27|  username?: string;
    28|  password?: string;
    29|}
    30|
    31|export interface ApiKeyEntry {
    32|  key: string;
    33|  name?: string; // 可选标签，如 "生产环境"、"测试"
    34|  allowedModels?: string[]; // 允许调用的模型列表（空或不设表示无限制）；支持通配符如 "gpt-*"
    35|}
    36|
    37|export interface GatewayConfig {
    38|  proxyUrl: string; // 自定义代理 URL，如 "https://your-proxy.com/proxy"
    39|  apiKeys: string[]; // 保持兼容：纯 key 字符串数组
    40|  apiKeyEntries?: ApiKeyEntry[]; // 带权限的 key 列表（优先使用）
    41|}
    42|
    43|export interface Provider {
    44|  id: string;
    45|  name: string;
    46|  type: ProviderType;
    47|  baseUrl: string;
    48|  apiKey: string;
    49|  enabled: boolean;
    50|  models: string[];
    51|  modelAliases?: Record<string, string>; // alias → model or provider/model, e.g. { "gpt4": "gpt-4o", "fast": "groq/llama-3.1-70b-versatile" }
    52|  rateLimit?: number; // requests per minute
    53|  proxy?: ProxyConfig; // 独立代理配置
    54|  createdAt: string;
    55|}
    56|
    57|export interface UsageRecord {
    58|  id: string;
    59|  providerId: string;
    60|  providerName: string;
    61|  model: string;
    62|  promptTokens: number;
    63|  completionTokens: number;
    64|  totalTokens: number;
    65|  cost: number;
    66|  timestamp: string;
    67|  status: "success" | "error" | "rate_limited";
    68|  latency: number; // ms
    69|}
    70|
    71|export interface RouteFallbackCandidate {
    72|  providerId: string; // 供应商 ID
    73|  models: string[];   // 该供应商下可承载的模型列表
    74|}
    75|
    76|export interface RouteRule {
    77|  id: string;
    78|  name: string;
    79|  mode: "pattern" | "fallback"; // 模式：pattern=正则匹配模型名，fallback=依次尝试供应商模型列表
    80|  // pattern 模式字段
    81|  pattern?: string; // e.g., "gpt-*"（mode=fallback 时不用）
    82|  targetProviderId?: string; // 模式匹配的目标供应商（mode=fallback 时不用）
    83|  // fallback 模式字段
    84|  orderedCandidates?: RouteFallbackCandidate[]; // 按优先顺序排列的候选供应商+模型
    85|  priority?: number; // fallback 模式下按此数字排序
    86|  enabled: boolean;
    87|}
    88|
    89|export interface DailyUsage {
    90|  date: string;
    91|  totalTokens: number;
    92|  totalCost: number;
    93|  requestCount: number;
    94|  byProvider: Record<string, { tokens: number; cost: number; count: number }>;
    95|}
    96|