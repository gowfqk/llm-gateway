import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useState, useEffect } from "react";
import { Key, Download, RefreshCw, Trash2, Cloud, Globe, Copy, Plus } from "lucide-react";
import { exportConfigurationData, importConfigurationData, clearUsageLogs } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  loadGatewayConfig,
  saveGatewayConfig,
  getProxyUrl,
  generateGatewayApiKey,
  type GatewayConfig,
} from "@/lib/gateway-config";

export default function SettingsPage({ onLogout, userEmail }: { onLogout: () => void; userEmail: string }) {
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig>({ proxyUrl: "", apiKeys: [] });

  useEffect(() => {
    loadGatewayConfig().then(setGatewayConfig);
  }, []);

  const handleSave = async () => {
    await saveGatewayConfig(gatewayConfig);
    console.log("设置已保存");
  };

  const handleRegenerateKey = (index: number) => {
    const newKey = generateGatewayApiKey();
    setGatewayConfig((prev) => ({
      ...prev,
      apiKeys: prev.apiKeys.map((key, keyIndex) => (keyIndex === index ? newKey : key)),
    }));
    console.log("API Key 已重新生成");
  };

  const handleAddApiKey = () => {
    const newKey = generateGatewayApiKey();
    setGatewayConfig((prev) => ({
      ...prev,
      apiKeys: [...prev.apiKeys, newKey],
    }));
    console.log("已添加新的 API Key");
  };

  const handleDeleteApiKey = (index: number) => {
    setGatewayConfig((prev) => ({
      ...prev,
      apiKeys: prev.apiKeys.filter((_, keyIndex) => keyIndex !== index),
    }));
    console.log("API Key 已删除");
  };

  const handleCopyApiKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      console.log("API Key 已复制");
    } catch {
      console.error("复制失败，请手动复制");
    }
  };

  const handleClearLogs = async () => {
    await clearUsageLogs();
    console.log("日志已清空");
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
    console.log("配置已导出");
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
        console.log("配置已导入，页面将刷新");
        setTimeout(() => window.location.reload(), 500);
      } catch {
        console.error("导入失败：文件格式错误");
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
            <CardDescription>支持多个客户端凭证。新增或重新生成后，点击底部“保存设置”才会正式持久化。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-muted-foreground">当前共 {gatewayConfig.apiKeys.length} 个 API Key</p>
              <Button variant="outline" size="sm" onClick={handleAddApiKey}>
                <Plus className="w-4 h-4 mr-1" />
                新增 API Key
              </Button>
            </div>

            {gatewayConfig.apiKeys.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                暂无 API Key，请先创建一个。
              </div>
            ) : (
              <div className="space-y-3">
                {gatewayConfig.apiKeys.map((apiKey, index) => (
                  <div key={`${apiKey}-${index}`} className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <Label>API Key #{index + 1}</Label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => handleCopyApiKey(apiKey)}>
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
                    <Input value={apiKey} readOnly className="font-mono" />
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">建议按客户端或环境分别生成独立 Key，泄露时可单独删除或重置。</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              代理地址
            </CardTitle>
            <CardDescription>浏览器中的 API 测试请求将通过此地址转发，以避免跨域问题。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>自定义代理 URL</Label>
              <Input
                value={gatewayConfig.proxyUrl}
                onChange={(e) => setGatewayConfig((prev) => ({ ...prev, proxyUrl: e.target.value }))}
                placeholder="例如：https://your-proxy.com/proxy"
              />
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>🔧 <strong>自定义</strong>：填写你自己的代理服务地址；留空则不使用自定义代理。</p>
              <p className="font-mono bg-muted px-1.5 py-0.5 rounded mt-1 inline-block">
                示例: https://your-server.com/proxy
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>当前使用：</span>
              <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                {getProxyUrl(gatewayConfig) || "未配置"}
              </code>
            </div>
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
              导出文件包含供应商、路由和网关设置，不包含使用日志；“清空日志”只删除 usage 日志，不会影响配置。
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
