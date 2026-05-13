import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Loader2, Trash2, Copy, Check, Settings2, StopCircle } from "lucide-react";
import { useProviders } from "@/hooks/useData";
import { loadGatewayConfig, getProxyUrl } from "@/lib/gateway-config";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestamp?: number;
  latency?: number;
  model?: string;
}

export default function PlaygroundPage({ onLogout, userEmail }: { onLogout: () => void; userEmail: string }) {
  const { data: providers } = useProviders();
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = sessionStorage.getItem("playground-messages");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(() => sessionStorage.getItem("playground-system-prompt") || "");
  const [model, setModel] = useState(() => sessionStorage.getItem("playground-model") || "");
  const [temperature, setTemperature] = useState(() => sessionStorage.getItem("playground-temperature") || "0.7");
  const [maxTokens, setMaxTokens] = useState(() => sessionStorage.getItem("playground-max-tokens") || "2048");
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [gatewayKey, setGatewayKey] = useState("");
  const [streamContent, setStreamContent] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 持久化对话和设置到 sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem("playground-messages", JSON.stringify(messages)); } catch {}
  }, [messages]);

  useEffect(() => {
    sessionStorage.setItem("playground-system-prompt", systemPrompt);
  }, [systemPrompt]);

  useEffect(() => {
    sessionStorage.setItem("playground-model", model);
  }, [model]);

  useEffect(() => {
    sessionStorage.setItem("playground-temperature", temperature);
  }, [temperature]);

  useEffect(() => {
    sessionStorage.setItem("playground-max-tokens", maxTokens);
  }, [maxTokens]);

  // 加载网关配置
  useEffect(() => {
    loadGatewayConfig().then((config) => {
      const url = getProxyUrl(config);
      setGatewayUrl(url);
      if (config.apiKeys.length > 0) {
        setGatewayKey(config.apiKeys[0]);
      }
    });
  }, []);

  // 收集所有可用模型
  const allModels = providers
    .filter((p) => p.enabled)
    .flatMap((p) => p.models.map((m) => ({ model: m, provider: p.name })));

  // 自动选择第一个模型
  useEffect(() => {
    if (!model && allModels.length > 0) {
      setModel(allModels[0].model);
    }
  }, [allModels, model]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent]);

  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;
    if (!model) {
      toast.error("请先选择模型");
      return;
    }

    const userMsg: Message = { id: generateId(), role: "user", content: input.trim(), timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setStreamContent("");

    // 构建请求消息列表
    const reqMessages: { role: string; content: string }[] = [];
    if (systemPrompt.trim()) {
      reqMessages.push({ role: "system", content: systemPrompt.trim() });
    }
    reqMessages.push(...newMessages.map((m) => ({ role: m.role, content: m.content })));

    // 确定 API endpoint
    const baseUrl = gatewayUrl || window.location.origin;
    const endpoint = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gatewayKey) {
      headers["Authorization"] = `Bearer ${gatewayKey}`;
    }

    const body = {
      model,
      messages: reqMessages,
      temperature: parseFloat(temperature) || 0.7,
      max_tokens: parseInt(maxTokens) || 2048,
      stream: true,
    };

    const startTime = Date.now();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const errMsg = errData?.error?.message || errData?.error || `HTTP ${resp.status}`;
        throw new Error(errMsg);
      }

      // 流式读取
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                setStreamContent(fullContent);
              }
            } catch {
              // 跳过解析失败的行
            }
          }
        }
      }

      const latency = Date.now() - startTime;
      const assistantMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: fullContent || "(空响应)",
        timestamp: Date.now(),
        latency,
        model,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamContent("");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // 用户手动停止
        if (streamContent) {
          const assistantMsg: Message = {
            id: generateId(),
            role: "assistant",
            content: streamContent + "\n\n_(已停止)_",
            timestamp: Date.now(),
            latency: Date.now() - startTime,
            model,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          setStreamContent("");
        }
      } else {
        const message = err instanceof Error ? err.message : "未知错误";
        toast.error(`请求失败: ${message}`);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, loading, model, messages, systemPrompt, temperature, maxTokens, gatewayUrl, gatewayKey, streamContent]);

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleClear = () => {
    setMessages([]);
    setStreamContent("");
    try { sessionStorage.removeItem("playground-messages"); } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyContent = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <AppLayout userEmail={userEmail} onLogout={onLogout}>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b shrink-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Playground</h1>
            <p className="text-muted-foreground text-sm mt-0.5">交互式对话测试</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {allModels.map(({ model: m, provider }) => (
                  <SelectItem key={`${provider}-${m}`} value={m}>
                    <span className="flex items-center gap-2">
                      <span className="truncate">{m}</span>
                      <span className="text-xs text-muted-foreground">({provider})</span>
                    </span>
                  </SelectItem>
                ))}
                {allModels.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">暂无可用模型</div>
                )}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => setShowSettings(!showSettings)} className={cn(showSettings && "bg-accent")}>
              <Settings2 className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleClear} disabled={messages.length === 0 && !streamContent}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="border-b py-3 shrink-0">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">System Prompt</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="你是一个有帮助的AI助手..."
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Temperature</Label>
                <Input
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Tokens</Label>
                <Input
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                  type="number"
                  min="1"
                  max="128000"
                  className="h-8"
                />
              </div>
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
          {messages.length === 0 && !streamContent && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <p className="text-lg font-medium mb-1">开始对话</p>
                <p className="text-sm">选择模型并输入消息，测试你的 LLM Gateway</p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[80%] rounded-lg px-4 py-2.5 relative group",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-border/40">
                    {msg.latency && (
                      <span className="text-xs text-muted-foreground">{msg.latency}ms</span>
                    )}
                    {msg.model && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1">{msg.model}</Badge>
                    )}
                    <button
                      onClick={() => copyContent(msg.id, msg.content)}
                      className="ml-auto text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Streaming content */}
          {streamContent && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-4 py-2.5 bg-muted">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{streamContent}</div>
                <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-border/40">
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">生成中...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t pt-4 shrink-0">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
              rows={2}
              className="resize-none flex-1"
              disabled={loading}
            />
            {loading ? (
              <Button variant="destructive" size="icon" className="h-auto" onClick={handleStop}>
                <StopCircle className="w-5 h-5" />
              </Button>
            ) : (
              <Button size="icon" className="h-auto" onClick={handleSend} disabled={!input.trim()}>
                <Send className="w-5 h-5" />
              </Button>
            )}
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
