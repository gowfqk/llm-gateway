import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { Key, Download, RefreshCw, Trash2, Cloud, Copy, Plus, Shield, ChevronDown, ChevronUp } from "lucide-react";
import { exportConfigurationData, importConfigurationData, clearUsageLogs } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";
import {
  loadGatewayConfig,
  saveGatewayConfig,
  generateGatewayApiKey,
  type GatewayConfig,
} from "@/lib/gateway-config";
import type { ApiKeyEntry } from "@/types";

export default function SettingsPage({ onLogout, userEmail }: { onLogout: () => void; userEmail: string }) {
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig>({ proxyUrl: "", apiKeys: [], apiKeyEntries: [] });
  const [expandedKeys, setExpandedKeys] = useState<Record<number, boolean>>({});

  useEffect(() => {
    loadGatewayConfig().then((config) => {
      // 如果有旧格式 apiKeys 但无 apiKeyEntries，自动迁移
      if (config.apiKeys.length > 0 && (!config.apiKeyEntries || config.apiKeyEntries.length === 0)) {
        const migrated: ApiKeyEntry[] = config.apiKeys.map((key) => ({ key, name: "", allowedModels: [] }));
        setGatewayConfig({ ...config, apiKeyEntries: migrated });
      } else {
        setGatewayConfig(config);
      }
    });
  }, []);

  // 获取当前 entries（优先使用 apiKeyEntries）
  const entries: ApiKeyEntry[] = gatewayConfig.apiKeyEntries && gatewayConfig.apiKeyEntries.length > 0
    ? gatewayConfig.apiKeyEntries
    : gatewayConfig.apiKeys.map((key) => ({ key, name: "", allowedModels: [] }));

  const updateEntries = (newEntries: ApiKeyEntry[]) => {
    setGatewayConfig((prev) => ({
      ...prev,
      apiKeys: newEntries.map((e) => e.key),
      apiKeyEntries: newEntries,
    }));
  };

  const handleSave = async () => {
    await saveGatewayConfig(gatewayConfig);
    toast.success("设置已保存");
  };

  const handleRegenerateKey = (index: number) => {
    const newKey = generateGatewayApiKey();
    const newEntries = entries.map((entry, i) => (i === index ? { ...entry, key: newKey } : entry));
    updateEntries(newEntries);
    toast.success("API Key 已重新生成");
  };

  const handleAddApiKey = () => {
    const newKey = generateGatewayApiKey();
    const newEntry: ApiKeyEntry = { key: newKey, name: "", allowedModels: [] };
    updateEntries([...entries, newEntry]);
    toast.success("已添加新的 API Key");
  };

  const handleDeleteApiKey = (index: number) => {
    updateEntries(entries.filter((_, i) => i !== index));
    setExpandedKeys((prev) => { const next = { ...prev }; delete next[index]; return next; });
    toast.success("API Key 已删除");
  };

  const handleCopyApiKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success("API Key 已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const handleUpdateEntryName = (index: number, name: string) => {
    const newEntries = entries.map((entry, i) => (i === index ? { ...entry, name } : entry));
    updateEntries(newEntries);
  };

  const handleUpdateAllowedModels = (index: number, modelsStr: string) => {
    const allowedModels = modelsStr.split(",").map((m) => m.trim()).filter(Boolean);
    const newEntries = entries.map((entry, i) => (i === index ? { ...entry, allowedModels } : entry));
    updateEntries(newEntries);
  };

  const toggleExpanded = (index: number) => {
    setExpandedKeys((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleClearLogs = async () => {
    await clearUsageLogs();
    toast.success("日志已清空");
    setTimeout(() => window.location.reload(), 500);
  };

  const handleExport = async () => {
    const data = await exportConfigurationData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "llm-gateway-export.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("配置已导出");
  };

  const handleImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        await importConfigurationData(data);
        toast.success("配置已导入，页面将刷新");
        setTimeout(() => window.location.reload(), 500);
      } catch {
        toast.error("导入失败：文件格式错误");
      }
    };
    input.click();
  };

  return (
    <AppLayout userEmail={userEmail} onLogout={onLogout}>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">设置</h1>
          <p className="text-muted-foreground mt-1">管理网关 API Key、代理地址与数据存储</p>
        </div>

        <Card className={isSupabaseConfigured() ? "border-emerald-200 dark:border-emerald-800" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="w-5 h-5" />
              数据存储
            </CardTitle>
            <CardDescription>
              {isSupabaseConfigured()
                ? "已连接 Supabase 云端数据库，数据跨设备同步"
                : "当前使用浏览器本地存储（IndexedDB），换设备数据不保留"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSupabaseConfigured() ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                云端同步已启用
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  未配置 Supabase，数据仅保存在本地
                </div>
                <p className="text-xs text-muted-foreground">
                  在 <code className="bg-muted px-1 rounded">.env</code> 文件中配置 <code className="bg-muted px-1 rounded">VITE_SUPABASE_URL</code> 和 <code className="bg-muted px-1 rounded">VITE_SUPABASE_ANON_KEY</code> 即可启用云端同步
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              网关 API Key
            </CardTitle>
            <CardDescription>支持多个客户端凭证，每个 Key 可设置模型访问权限。新增或修改后，点击底部"保存设置"才会正式持久化。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-muted-foreground">当前共 {entries.length} 个 API Key</p>
              <Button variant="outline" size="sm" onClick={handleAddApiKey}>
                <Plus className="w-4 h-4 mr-1" />
                新增 API Key
              </Button>
            </div>

            {entries.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                暂无 API Key，请先创建一个。
              </div>
            ) : (
              <div className="space-y-3">
                {entries.map((entry, index) => (
                  <div key={`${entry.key}-${index}`} className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Label className="font-medium">
                          {entry.name ? entry.name : `API Key #${index + 1}`}
                        </Label>
                        {entry.allowedModels && entry.allowedModels.length > 0 && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Shield className="w-3 h-3" />
                            {entry.allowedModels.length} 个模型
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="ghost" size="sm" onClick={() => toggleExpanded(index)} title="展开权限设置">
                          {expandedKeys[index] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleCopyApiKey(entry.key)}>
                          <Copy className="w-4 h-4 mr-1" />
                          复制
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleRegenerateKey(index)}>
                          <RefreshCw className="w-4 h-4 mr-1" />
                          重新生成
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeleteApiKey(index)}>
                          <Trash2 className="w-4 h-4 mr-1" />
                          删除
                        </Button>
                      </div>
                    </div>
                    <Input value={entry.key} readOnly className="font-mono text-sm" />

                    {expandedKeys[index] && (
                      <div className="space-y-3 pt-2 border-t">
                        <div className="space-y-2">
                          <Label className="text-xs">标签名称（可选）</Label>
                          <Input
                            value={entry.name || ""}
                            onChange={(e) => handleUpdateEntryName(index, e.target.value)}
                            placeholder="例如：生产环境、测试用"
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-muted-foreground" />
                            <Label className="text-xs">允许调用的模型（留空表示无限制）</Label>
                          </div>
                          <Textarea
                            value={(entry.allowedModels || []).join(", ")}
                            onChange={(e) => handleUpdateAllowedModels(index, e.target.value)}
                            placeholder="gpt-4o, claude-*, deepseek-chat（支持通配符 *，逗号分隔）"
                            rows={2}
                            className="text-sm"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            留空 = 允许所有模型。支持通配符：<code className="bg-muted px-1 rounded">gpt-*</code> 匹配所有 gpt 开头的模型，<code className="bg-muted px-1 rounded">*</code> 允许全部。别名也会被检查。
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">建议按客户端或环境分别生成独立 Key，泄露时可单独删除或重置。</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>数据管理</CardTitle>
            <CardDescription>导出/导入供应商、路由与网关配置，或单独清理使用日志</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                导出配置
              </Button>
              <Button variant="outline" onClick={handleImport}>
                <Download className="w-4 h-4 mr-2 rotate-180" />
                导入配置
              </Button>
              <Button variant="outline" onClick={handleClearLogs}>
                <Trash2 className="w-4 h-4 mr-2" />
                清空日志
              </Button>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              导出文件包含供应商、路由和网关设置，不包含使用日志；"清空日志"只删除 usage 日志，不会影响配置。
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} size="lg">保存设置</Button>
        </div>
      </div>
    </AppLayout>
  );
}
