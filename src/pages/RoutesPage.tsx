import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { saveRouteData, deleteRouteData, generateId } from "@/lib/store";
import type { RouteRule } from "@/types";
import { useState } from "react";
import { Plus, Pencil, Trash2, ArrowUpDown } from "lucide-react";
import { useProviders } from "@/hooks/useData";
import { useRoutes } from "@/hooks/useData";
import { Skeleton } from "@/components/ui/skeleton";

export default function RoutesPage({ onLogout, userEmail }: { onLogout: () => void; userEmail: string }) {
  const { data: providers, loading: loadingProviders } = useProviders();
  const { data: routes, loading: loadingRoutes, setData: setRoutes } = useRoutes();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteRule | null>(null);
  const [formData, setFormData] = useState({ name: "", pattern: "", targetProviderId: "", priority: "1" });

  const openCreate = () => {
    setEditingRoute(null);
    setFormData({ name: "", pattern: "", targetProviderId: providers[0]?.id || "", priority: "1" });
    setDialogOpen(true);
  };

  const openEdit = (r: RouteRule) => {
    setEditingRoute(r);
    setFormData({ name: r.name, pattern: r.pattern, targetProviderId: r.targetProviderId, priority: r.priority.toString() });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.pattern || !formData.targetProviderId) {
      console.error("请填写必填字段");
      return;
    }
    if (editingRoute) {
      const updated = routes.map((r) =>
        r.id === editingRoute.id ? { ...r, name: formData.name, pattern: formData.pattern, targetProviderId: formData.targetProviderId, priority: parseInt(formData.priority) } : r
      );
      setRoutes(updated);
      await saveRouteData(updated.find((r) => r.id === editingRoute.id)!);
      console.log("路由规则已更新");
    } else {
      const newRoute: RouteRule = {
        id: generateId("route"), name: formData.name, pattern: formData.pattern,
        targetProviderId: formData.targetProviderId, priority: parseInt(formData.priority), enabled: true,
      };
      const updated = [...routes, newRoute].sort((a, b) => a.priority - b.priority);
      setRoutes(updated);
      await saveRouteData(newRoute);
      console.log("路由规则已添加");
    }
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    const updated = routes.filter((r) => r.id !== id);
    setRoutes(updated);
    await deleteRouteData(id);
    console.log("路由规则已删除");
  };

  const toggleEnabled = async (id: string) => {
    const updated = routes.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    setRoutes(updated);
    await saveRouteData(updated.find((r) => r.id === id)!);
  };

  const movePriority = async (id: string, direction: "up" | "down") => {
    const sorted = [...routes].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const tempPriority = sorted[idx].priority;
    sorted[idx] = { ...sorted[idx], priority: sorted[swapIdx].priority };
    sorted[swapIdx] = { ...sorted[swapIdx], priority: tempPriority };
    const updated = sorted.sort((a, b) => a.priority - b.priority);
    setRoutes(updated);
    await saveRouteData(updated.find((r) => r.id === id)!);
    await saveRouteData(updated.find((r) => r.priority === tempPriority)!);
  };

  const getProviderName = (id: string) => providers.find((p) => p.id === id)?.name || "未知";

  if (loadingProviders || loadingRoutes) {
    return (
      <AppLayout userEmail={userEmail} onLogout={onLogout}>
        <div className="space-y-6">
          <div><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-48 mt-2" /></div>
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
            <h1 className="text-2xl font-bold tracking-tight">路由规则</h1>
            <p className="text-muted-foreground mt-1">配置模型请求的路由分发策略</p>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />添加规则</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>路由规则列表</CardTitle><CardDescription>按优先级从高到低排列，匹配到的第一个规则将被使用</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">优先级</TableHead>
                  <TableHead>规则名称</TableHead>
                  <TableHead>匹配模式</TableHead>
                  <TableHead>目标供应商</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...routes].sort((a, b) => a.priority - b.priority).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-sm font-bold w-6 text-center">{r.priority}</span>
                        <div className="flex flex-col">
                          <button onClick={() => movePriority(r.id, "up")} className="text-muted-foreground hover:text-foreground leading-none"><ArrowUpDown className="w-3 h-3 rotate-180" /></button>
                          <button onClick={() => movePriority(r.id, "down")} className="text-muted-foreground hover:text-foreground leading-none"><ArrowUpDown className="w-3 h-3" /></button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell><code className="text-sm bg-muted px-2 py-0.5 rounded">{r.pattern}</code></TableCell>
                    <TableCell><Badge variant="secondary">{getProviderName(r.targetProviderId)}</Badge></TableCell>
                    <TableCell><Switch checked={r.enabled} onCheckedChange={() => toggleEnabled(r.id)} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRoute ? "编辑路由规则" : "添加路由规则"}</DialogTitle>
              <DialogDescription>配置模型名称的匹配规则和目标供应商</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>规则名称 *</Label>
                <Input value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} placeholder="例如：GPT 默认路由" />
              </div>
              <div className="space-y-2">
                <Label>匹配模式 *</Label>
                <Input value={formData.pattern} onChange={(e) => setFormData((prev) => ({ ...prev, pattern: e.target.value }))} placeholder="例如：gpt-*（支持通配符）" />
                <p className="text-xs text-muted-foreground">使用 * 作为通配符，例如 gpt-* 匹配所有 gpt- 开头的模型</p>
              </div>
              <div className="space-y-2">
                <Label>目标供应商 *</Label>
                <Select value={formData.targetProviderId} onValueChange={(v) => setFormData((prev) => ({ ...prev, targetProviderId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {providers.filter((p) => p.enabled).map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>优先级</Label>
                <Input value={formData.priority} onChange={(e) => setFormData((prev) => ({ ...prev, priority: e.target.value }))} placeholder="数字越小优先级越高" type="number" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={handleSave}>{editingRoute ? "保存" : "添加"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
