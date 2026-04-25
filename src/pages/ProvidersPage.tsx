import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { saveProviderData, deleteProviderData, generateId } from "@/lib/store";
import type { Provider, ProviderType, ProxyConfig } from "@/types";
import { useState, Fragment, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, Copy, Check, Sparkles, Loader2, TestTube, TestTube2, AlertCircle, Globe, ChevronDown, ChevronUp, Wand2 } from "lucide-react";
import { useProviders } from "@/hooks/useData";
import { Skeleton } from "@/components/ui/skeleton";
import { isSupabaseConfigured } from "@/lib/supabase";
import { loadGatewayConfig, getProxyUrl, type GatewayConfig } from "@/lib/gateway-config";
import { cn } from "@/lib/utils";

const PROVIDER_CONFIGS: Record<Exclude<ProviderType, "custom">, { label: string; defaultBaseUrl: string; color: string; free?: boolean; desc?: string }> = {
  openai: { label: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1", color: "bg-emerald-500" },
  anthropic: { label: "Anthropic", defaultBaseUrl: "https://api.anthropic.com/v1", color: "bg-red-500" },
  google: { label: "Google AI", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", color: "bg-blue-500" },
  azure: { label: "Azure OpenAI", defaultBaseUrl: "https://{resource}.openai.azure.com", color: "bg-sky-500" },
  deepseek: { label: "DeepSeek", defaultBaseUrl: "https://api.deepseek.com/v1", color: "bg-violet-500" },
  moonshot: { label: "Moonshot (Kimi)", defaultBaseUrl: "https://api.moonshot.cn/v1", color: "bg-amber-500" },
  zhipu: { label: "智谱 AI", defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4", color: "bg-orange-500" },
  baichuan: { label: "百川智能", defaultBaseUrl: "https://api.baichuan-ai.com/v1", color: "bg-cyan-500" },
  minimax: { label: "MiniMax", defaultBaseUrl: "https://api.minimax.chat/v1", color: "bg-pink-500" },
  openrouter: { label: "OpenRouter", defaultBaseUrl: "https://openrouter.ai/api/v1", color: "bg-indigo-500", free: true, desc: "聚合多家模型，提供免费额度" },
  modelscope: { label: "魔塔社区", defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", color: "bg-teal-500", free: true, desc: "阿里云免费额度，支持通义千问等" },
  cloudflare: { label: "Cloudflare AI", defaultBaseUrl: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai", color: "bg-orange-400", free: true, desc: "Workers AI 免费额度，支持 Llama/Qwen 等" },
  groq: { label: "Groq", defaultBaseUrl: "https://api.groq.com/openai/v1", color: "bg-fuchsia-500", free: true, desc: "超快推理，免费额度可用" },
  siliconflow: { label: "硅基流动", defaultBaseUrl: "https://api.siliconflow.cn/v1", color: "bg-lime-500", free: true, desc: "免费额度，支持 Qwen/DeepSeek 等" },
  iflytek: { label: "讯飞星辰", defaultBaseUrl: "https://spark-api.xf-yun.com/v1", color: "bg-purple-500", free: true, desc: "讯飞星火大模型，提供免费额度" },
};

export default function ProvidersPage({ onLogout, userEmail }: { onLogout: () => void; userEmail: string }) {
  const { data: providers, loading, setData: setProviders, refresh } = useProviders();
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig>({ proxyUrl: "", apiKeys: [] });
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [formData, setFormData] = useState({
    name: "", type: "custom" as ProviderType, baseUrl: "", apiKey: "", models: "", rateLimit: "",
    proxyEnabled: false, proxyType: "none" as ProxyConfig["type"], proxyHost: "", proxyPort: "", proxyUser: "", proxyPass: "",
  });
  const [showProxy, setShowProxy] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);

  const fetchModelsFromApi = useCallback(async () => {
    if (!formData.baseUrl || !formData.apiKey) {
      setFetchModelsError("请先填写 Base URL 和 API Key");
      return;
    }
    setFetchingModels(true);
    setFetchModelsError(null);

    try {
      const modelsUrl = formData.baseUrl.replace(/\/$/, "") + "/models";
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${formData.apiKey}`,
      };

      // Anthropic uses x-api-key header
      if (formData.type === "anthropic") {
        headers["x-api-key"] = formData.apiKey;
        headers["anthropic-version"] = "2023-06-01";
        delete headers["Authorization"];
      }

      const response = await fetch("/api/test-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: modelsUrl, headers, body: null, method: "GET", providerName: formData.name || "unknown" }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        setFetchModelsError(result.error || `获取模型失败 (HTTP ${response.status})`);
        return;
      }

      const data = result.data;
      if (!data || !Array.isArray(data.data)) {
        // Some providers return models directly as array
        const models = Array.isArray(data) ? data : [];
        if (models.length === 0) {
          setFetchModelsError("该供应商未返回模型列表，请手动填写");
          return;
        }
        const modelIds = models.map((m: Record<string, unknown>) => (m.id as string) || (m.name as string) || "").filter(Boolean);
        setFormData((prev) => ({ ...prev, models: modelIds.join(", ") }));
        return;
      }

      // Standard OpenAI format: { data: [{ id: "model-name", ... }] }
      const modelIds = data.data.map((m: Record<string, unknown>) => (m.id as string) || "").filter(Boolean);
      if (modelIds.length === 0) {
        setFetchModelsError("模型列表为空，请手动填写");
        return;
      }
      setFormData((prev) => ({ ...prev, models: modelIds.join(", ") }));
    } catch (err) {
      setFetchModelsError("连接失败，请检查 Base URL");
    } finally {
      setFetchingModels(false);
    }
  }, [formData.baseUrl, formData.apiKey, formData.type, formData.name]);

  useEffect(() => {
    loadGatewayConfig().then(setGatewayConfig);
  }, []);

  const openCreate = () => {
    setEditingProvider(null);
    setFormData({ name: "", type: "custom", baseUrl: "", apiKey: "", models: "", rateLimit: "", proxyEnabled: false, proxyType: "none", proxyHost: "", proxyPort: "", proxyUser: "", proxyPass: "" });
    setShowProxy(false);
    setDialogOpen(true);
  };

  const openEdit = (p: Provider) => {
    setEditingProvider(p);
    const proxy = p.proxy;
    setFormData({
      name: p.name, type: p.type, baseUrl: p.baseUrl, apiKey: p.apiKey,
      models: p.models.join(", "), rateLimit: p.rateLimit?.toString() || "",
      proxyEnabled: proxy?.enabled || false,
      proxyType: proxy?.type || "none",
      proxyHost: proxy?.host || "",
      proxyPort: proxy?.port?.toString() || "",
      proxyUser: proxy?.username || "",
      proxyPass: proxy?.password || "",
    });
    setShowProxy(!!proxy?.enabled);
    setDialogOpen(true);
  };

  const handleTypeChange = (type: ProviderType) => {
    setFormData((prev) => ({
      ...prev, type,
      baseUrl: type !== "custom" ? PROVIDER_CONFIGS[type]?.defaultBaseUrl || prev.baseUrl : prev.baseUrl,
    }));
  };

  const handleSave = async () => {
    if (!formData.name || !formData.baseUrl || !formData.apiKey) {
      console.error("请填写必填字段");
      return;
    }
    const models = formData.models.split(",").map((m) => m.trim()).filter(Boolean);
    
    console.log("[handleSave] formData:", formData);
    console.log("[handleSave] models:", models);

    const proxy: ProxyConfig = formData.proxyEnabled
      ? {
          enabled: true,
          type: formData.proxyType,
          host: formData.proxyHost || undefined,
          port: formData.proxyPort ? parseInt(formData.proxyPort) : undefined,
          username: formData.proxyUser || undefined,
          password: formData.proxyPass || undefined,
        }
      : { enabled: false, type: "none" };

    if (editingProvider) {
      const updated = providers.map((p) =>
        p.id === editingProvider.id
          ? { ...p, name: formData.name, type: formData.type, baseUrl: formData.baseUrl, apiKey: formData.apiKey, models, rateLimit: formData.rateLimit ? parseInt(formData.rateLimit) : undefined, proxy }
          : p
      );
      setProviders(updated);
      await saveProviderData(updated.find((p) => p.id === editingProvider.id)!);
      await refresh();
      console.log("供应商已更新");
    } else {
      const newProvider: Provider = {
        id: generateId("prov"), name: formData.name, type: formData.type,
        baseUrl: formData.baseUrl, apiKey: formData.apiKey, enabled: true, models,
        rateLimit: formData.rateLimit ? parseInt(formData.rateLimit) : undefined,
        proxy,
        createdAt: new Date().toISOString(),
      };
      const updated = [...providers, newProvider];
      setProviders(updated);
      await saveProviderData(newProvider);
      await refresh();
      console.log("供应商已添加");
    }
    setDialogOpen(false);
  };
  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除此供应商吗？")) return;
    const updated = providers.filter((p) => p.id !== id);
    setProviders(updated);
    await deleteProviderData(id);
    await refresh();
    console.log("供应商已删除");
  };

  const toggleEnabled = async (id: string) => {
    const updated = providers.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
    setProviders(updated);
    await saveProviderData(updated.find((p) => p.id === id)!);
    await refresh();
  };

  const copyApiKey = (id: string, key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedId(id);
    console.log("API Key 已复制");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; latency?: number }>>({});

  const testProviderApi = async (provider: Provider) => {
    setTestingId(provider.id);
    const startTime = Date.now();
    try {
      let targetUrl = provider.baseUrl;
      let headers: Record<string, string> = {};
      let body: Record<string, unknown> | undefined;

      // Build test request based on provider type
      switch (provider.type) {
        case "openai":
        case "deepseek":
        case "groq":
        case "openrouter":
        case "siliconflow":
        case "custom": {
          targetUrl = provider.baseUrl.replace(/\/$/, "") + "/chat/completions";
          headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${provider.apiKey}`,
          };
          body = {
            model: provider.models[0] || "gpt-4o-mini",
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 1,
          };
          break;
        }
        case "anthropic": {
          targetUrl = provider.baseUrl.replace(/\/$/, "") + "/messages";
          headers = {
            "Content-Type": "application/json",
            "x-api-key": provider.apiKey,
            "anthropic-version": "2023-06-01",
          };
          body = {
            model: provider.models[0] || "claude-haiku-3-20241022",
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 1,
          };
          break;
        }
        case "google": {
          const model = provider.models[0] || "gemini-2.0-flash";
          targetUrl = provider.baseUrl.replace(/\/$/, "") + `/models/${model}:generateContent?key=${provider.apiKey}`;
          headers = { "Content-Type": "application/json" };
          body = { contents: [{ parts: [{ text: "Hi" }] }] };
          break;
        }
        case "cloudflare": {
          const model = provider.models[0] || "@cf/meta/llama-3.1-8b-instruct";
          targetUrl = provider.baseUrl.replace(/\/$/, "").replace("{account_id}", "test") + `/run/${model}`;
          headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${provider.apiKey}`,
          };
          body = { messages: [{ role: "user", content: "Hi" }] };
          break;
        }
        case "modelscope":
        case "zhipu":
        case "baichuan":
        case "minimax":
        case "moonshot": {
          targetUrl = provider.baseUrl.replace(/\/$/, "") + "/chat/completions";
          headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${provider.apiKey}`,
          };
          body = {
            model: provider.models[0] || "qwen-turbo",
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 1,
          };
          break;
        }
        case "azure": {
          targetUrl = provider.baseUrl.replace(/\/$/, "") + `/openai/deployments/${provider.models[0] || "gpt-4o-mini"}/chat/completions?api-version=2024-02-01`;
          headers = {
            "Content-Type": "application/json",
            "api-key": provider.apiKey,
          };
          body = {
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 1,
          };
          break;
        }
        default: {
          targetUrl = provider.baseUrl.replace(/\/$/, "") + "/chat/completions";
          headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${provider.apiKey}`,
          };
          body = {
            model: provider.models[0] || "test",
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 1,
          };
        }
      }

      // 通过后端代理测试 API（绕过浏览器 CORS 限制）
      let result: { ok?: boolean; latency?: number; status?: number; error?: string; data?: unknown };
      let usedStrategy = "backend";

      try {
        const testResponse = await fetch("/api/test-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: targetUrl,
            headers,
            body,
            providerName: provider.name,
          }),
        });

        const testResult = await testResponse.json();
        
        if (!testResponse.ok) {
          throw new Error(testResult.error || "测试请求失败");
        }

        result = testResult;
      } catch (err) {
        // 测试失败
        setTestResults((prev) => ({ ...prev, [provider.id]: { ok: false, message: "连接失败" } }));
        console.error(`${provider.name} API 测试失败：连接失败`);
        setTestingId(null);
        return;
      }

      if (result.ok) {
        setTestResults((prev) => ({ ...prev, [provider.id]: { ok: true, message: "连接成功", latency: result.latency } }));
        console.log(`${provider.name} API 测试成功 (${result.latency}ms)`);
      } else {
        let errorMsg = result.error || `HTTP ${result.status}`;
        if (result.status === 401 || errorMsg.includes("Invalid")) errorMsg = "API Key 无效或已过期";
        else if (result.status === 403) errorMsg = "权限不足";
        else if (result.status === 429) errorMsg = "请求频率超限";
        setTestResults((prev) => ({ ...prev, [provider.id]: { ok: false, message: errorMsg, latency: result.latency } }));
        console.error(`${provider.name} API 测试失败：${errorMsg}`);
      }
    } catch (err: unknown) {
      const latency = Date.now() - startTime;
      let message = "连接失败";
      if (err instanceof Error) message = err.message;
      setTestResults((prev) => ({ ...prev, [provider.id]: { ok: false, message, latency } }));
      console.error(`${provider.name} API 测试失败: ${message}`);
    } finally {
      setTestingId(null);
    }
  };

  const testAllApis = async () => {
    for (const p of providers) {
      if (p.apiKey && !p.apiKey.includes("***")) {
        await testProviderApi(p);
      }
    }
  };

  if (loading) {
    return (
      <AppLayout userEmail={userEmail} onLogout={onLogout}>
        <div className="space-y-6">
          <div><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-48 mt-2" /></div>
          <div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardContent className="pt-6"><Skeleton className="h-8 w-16" /><Skeleton className="h-4 w-20 mt-2" /></CardContent></Card>)}</div>
          <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout userEmail={userEmail} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">供应商管理</h1>
            <p className="text-muted-foreground mt-1">配置和管理 LLM API 供应商</p>
          </div>
          <div className="flex items-center gap-3">
            {isSupabaseConfigured() && (
              <Badge variant="outline" className="gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                云端同步
              </Badge>
            )}
            <Button variant="outline" onClick={testAllApis}>
              <TestTube2 className="w-4 h-4 mr-2" />
              批量测试
            </Button>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              添加供应商
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{providers.length}</div><div className="text-sm text-muted-foreground">总供应商数</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{providers.filter((p) => p.enabled).length}</div><div className="text-sm text-muted-foreground">已启用</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{providers.reduce((s, p) => s + p.models.length, 0)}</div><div className="text-sm text-muted-foreground">可用模型数</div></CardContent></Card>
        </div>

        {/* Provider Table */}
        <Card>
          <CardHeader><CardTitle>供应商列表</CardTitle><CardDescription>管理所有已配置的 LLM 供应商</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>供应商</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>Base URL</TableHead>
                  <TableHead>API Key</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead>速率限制</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((p) => {
                  const config = p.type !== "custom" ? PROVIDER_CONFIGS[p.type] : null;
                  return (
                    <Fragment key={p.id}>
                      <TableRow>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${config?.color || "bg-gray-400"}`} />
                          <span className="font-medium">{p.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="capitalize">{config?.label || p.type}</Badge>
                          {config?.free && (
                            <Badge variant="secondary" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                              <Sparkles className="w-3 h-3 mr-0.5" />免费
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate block max-w-[200px]">{p.baseUrl}</code></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{showKey[p.id] ? p.apiKey : p.apiKey.slice(0, 6) + "••••••"}</code>
                          <button onClick={() => setShowKey((prev) => ({ ...prev, [p.id]: !prev[p.id] }))} className="text-muted-foreground hover:text-foreground">
                            {showKey[p.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => copyApiKey(p.id, p.apiKey)} className="text-muted-foreground hover:text-foreground">
                            {copiedId === p.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {p.models.slice(0, 2).map((m) => (<Badge key={m} variant="secondary" className="text-xs">{m}</Badge>))}
                          {p.models.length > 2 && (<Badge variant="secondary" className="text-xs">+{p.models.length - 2}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell>{p.rateLimit ? `${p.rateLimit}/min` : "—"}</TableCell>
                      <TableCell><Switch checked={p.enabled} onCheckedChange={() => toggleEnabled(p.id)} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => testProviderApi(p)} disabled={testingId === p.id}>
                            {testingId === p.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : testResults[p.id]?.ok ? (
                              <Check className="w-4 h-4 text-emerald-500" />
                            ) : testResults[p.id] ? (
                              <AlertCircle className="w-4 h-4 text-red-500" />
                            ) : (
                              <TestTube className="w-4 h-4" />
                            )}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {testResults[p.id] && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-1 px-4">
                          <div className={cn(
                            "text-xs px-2 py-1 rounded flex items-center gap-2",
                            testResults[p.id].ok
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                              : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                          )}>
                            {testResults[p.id].ok ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <AlertCircle className="w-3 h-3" />
                            )}
                            <span>{testResults[p.id].message}</span>
                            {testResults[p.id].latency && (
                              <span className="ml-auto opacity-70">{testResults[p.id].latency}ms</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingProvider ? "编辑供应商" : "添加供应商"}</DialogTitle>
              <DialogDescription>{editingProvider ? "更新供应商配置信息" : "配置新的 LLM API 供应商"}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>供应商类型</Label>
                  <Select value={formData.type} onValueChange={(v) => handleTypeChange(v as ProviderType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">付费供应商</div>
                      {Object.entries(PROVIDER_CONFIGS).filter(([, cfg]) => !cfg.free).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                      ))}
                      <div className="px-2 py-1.5 text-xs font-semibold text-emerald-600 uppercase tracking-wider">✨ 免费 / 有免费额度</div>
                      {Object.entries(PROVIDER_CONFIGS).filter(([, cfg]) => cfg.free).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-emerald-500" />{cfg.label}</span>
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">其他</div>
                      <SelectItem value="custom">自定义</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>名称 *</Label>
                  <Input value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} placeholder="例如：My OpenAI" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Base URL *</Label>
                <Input value={formData.baseUrl} onChange={(e) => setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))} placeholder="https://api.example.com/v1" />
              </div>
              <div className="space-y-2">
                <Label>API Key *</Label>
                <Input value={formData.apiKey} onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))} placeholder="sk-..." type="password" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>可用模型</Label>
                  <Button variant="outline" size="sm" onClick={fetchModelsFromApi} disabled={fetchingModels} className="h-7 text-xs gap-1.5">
                    {fetchingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    {fetchingModels ? "获取中..." : "自动获取"}
                  </Button>
                </div>
                {fetchModelsError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{fetchModelsError}
                  </p>
                )}
                <Textarea value={formData.models} onChange={(e) => { setFormData((prev) => ({ ...prev, models: e.target.value })); setFetchModelsError(null); }} placeholder="gpt-4o, gpt-4o-mini（逗号分隔）或点击「自动获取」" rows={3} />
              </div>
              <div className="space-y-2">
                <Label>速率限制 (请求/分钟)</Label>
                <Input value={formData.rateLimit} onChange={(e) => setFormData((prev) => ({ ...prev, rateLimit: e.target.value }))} placeholder="例如：500" type="number" />
              </div>

              {/* Proxy Config */}
              <div className="border rounded-lg p-4 space-y-3">
                <button
                  type="button"
                  className="flex items-center justify-between w-full text-sm font-medium"
                  onClick={() => setShowProxy(!showProxy)}
                >
                  <span className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    代理配置
                  </span>
                  {showProxy ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showProxy && (
                  <div className="space-y-3 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="proxy-enabled"
                        checked={formData.proxyEnabled}
                        onChange={(e) => setFormData((prev) => ({ ...prev, proxyEnabled: e.target.checked }))}
                        className="rounded"
                      />
                      <Label htmlFor="proxy-enabled" className="text-sm cursor-pointer">启用代理</Label>
                    </div>

                    {formData.proxyEnabled && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label className="text-xs">代理类型</Label>
                            <select
                              value={formData.proxyType}
                              onChange={(e) => setFormData((prev) => ({ ...prev, proxyType: e.target.value as ProxyConfig["type"] }))}
                              className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm"
                            >
                              <option value="socks5">SOCKS5</option>
                              <option value="http">HTTP</option>
                              <option value="https">HTTPS</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-2">
                              <Label className="text-xs">主机</Label>
                              <Input value={formData.proxyHost} onChange={(e) => setFormData((prev) => ({ ...prev, proxyHost: e.target.value }))} placeholder="127.0.0.1" className="h-9" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">端口</Label>
                              <Input value={formData.proxyPort} onChange={(e) => setFormData((prev) => ({ ...prev, proxyPort: e.target.value }))} placeholder="1080" className="h-9" type="number" />
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label className="text-xs">用户名（可选）</Label>
                            <Input value={formData.proxyUser} onChange={(e) => setFormData((prev) => ({ ...prev, proxyUser: e.target.value }))} placeholder="user" className="h-9" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">密码（可选）</Label>
                            <Input value={formData.proxyPass} onChange={(e) => setFormData((prev) => ({ ...prev, proxyPass: e.target.value }))} placeholder="pass" className="h-9" type="password" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={handleSave}>{editingProvider ? "保存" : "添加"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
