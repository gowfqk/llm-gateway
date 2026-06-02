import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import type { RouteRule, RouteFallbackCandidate } from "@/types";
import { useState } from "react";
import { Plus, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, X, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { useProviders, useRoutes } from "@/hooks/useData";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function RoutesPage({ onLogout, userEmail }: { onLogout: () => void; userEmail: string }) {
  const { data: providers, loading: loadingProviders } = useProviders();
  const { data: routes, loading: loadingRoutes, setData: setRoutes } = useRoutes();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteRule | null>(null);

  // Form state shared by both modes
  const [formName, setFormName] = useState("");
  const [formMode, setFormMode] = useState<"pattern" | "fallback">("pattern");
  const [formPriority, setFormPriority] = useState("1");

  // Pattern-mode form fields
  const [formPattern, setFormPattern] = useState("");
  const [formTargetProviderId, setFormTargetProviderId] = useState("");

  // Fallback-mode form fields
  const [formCandidates, setFormCandidates] = useState<RouteFallbackCandidate[]>([]);
  const [expandedCandidates, setExpandedCandidates] = useState<Record<number, boolean>>({});

  const resetForm = () => {
    setFormName("");
    setFormMode("pattern");
    setFormPriority("1");
    setFormPattern("");
    setFormTargetProviderId(providers[0]?.id || "");
    setFormCandidates([]);
    setExpandedCandidates({});
  };

  const openCreate = () => {
    setEditingRoute(null);
    resetForm();
    setFormTargetProviderId(providers[0]?.id || "");
    setDialogOpen(true);
  };

  const openEdit = (r: RouteRule) => {
    setEditingRoute(r);
    setFormName(r.name);
    setFormMode(r.mode || "pattern");
    setFormPriority((r.priority ?? 1).toString());
    setFormPattern(r.pattern || "");
    setFormTargetProviderId(r.targetProviderId || providers[0]?.id || "");
    setFormCandidates(r.orderedCandidates ? [...r.orderedCandidates] : []);
    setExpandedCandidates({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName) {
      toast.error("请填写规则名称");
      return;
    }

    if (formMode === "pattern") {
      if (!formPattern || !formTargetProviderId) {
        toast.error("请填写匹配模式和目标供应商");
        return;
      }
      const route: RouteRule = editingRoute
        ? { ...editingRoute, name: formName, mode: "pattern", pattern: formPattern, targetProviderId: formTargetProviderId, priority: parseInt(formPriority) || 1, enabled: editingRoute.enabled }
        : { id: generateId("route"), name: formName, mode: "pattern", pattern: formPattern, targetProviderId: formTargetProviderId, priority: parseInt(formPriority) || 1, enabled: true };

      if (editingRoute) {
        const updated = routes.map((r) => r.id === editingRoute.id ? route : r);
        setRoutes(updated);
        await saveRouteData(route);
        toast.success("路由规则已更新");
      } else {
        const updated = [...routes, route].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
        setRoutes(updated);
        await saveRouteData(route);
        toast.success("路由规则已添加");
      }
    } else {
      // fallback mode
      if (!formPattern) {
        toast.error("请填写触发模型名");
        return;
      }
      const validCandidates = formCandidates.filter((c) => c.providerId && c.models.length > 0);
      if (validCandidates.length === 0) {
        toast.error("请至少添加一个候选供应商");
        return;
      }
      const route: RouteRule = editingRoute
        ? { ...editingRoute, name: formName, mode: "fallback", pattern: formPattern, orderedCandidates: validCandidates, priority: parseInt(formPriority) || 1, enabled: editingRoute.enabled }
        : { id: generateId("route"), name: formName, mode: "fallback", pattern: formPattern, orderedCandidates: validCandidates, priority: parseInt(formPriority) || 1, enabled: true };

      if (editingRoute) {
        const updated = routes.map((r) => r.id === editingRoute.id ? route : r);
        setRoutes(updated);
        await saveRouteData(route);
        toast.success("路由规则已更新");
      } else {
        const updated = [...routes, route].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
        setRoutes(updated);
        await saveRouteData(route);
        toast.success("路由规则已添加");
      }
    }
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    const updated = routes.filter((r) => r.id !== id);
    setRoutes(updated);
    await deleteRouteData(id);
    toast.success("路由规则已删除");
  };

  const toggleEnabled = async (id: string) => {
    const updated = routes.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    setRoutes(updated);
    await saveRouteData(updated.find((r) => r.id === id)!);
  };

  const movePriority = async (id: string, direction: "up" | "down") => {
    const sorted = [...routes].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    const idx = sorted.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const tempPriority = sorted[idx].priority;
    sorted[idx] = { ...sorted[idx], priority: sorted[swapIdx].priority };
    sorted[swapIdx] = { ...sorted[swapIdx], priority: tempPriority };
    const updated = sorted.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    setRoutes(updated);
    await saveRouteData(updated.find((r) => r.id === id)!);
    await saveRouteData(updated.find((r) => r.priority === tempPriority)!);
  };

  // Candidate helpers
  const addCandidate = () => {
    setFormCandidates([...formCandidates, { providerId: "", models: [] }]);
    setExpandedCandidates((prev) => ({ ...prev, [formCandidates.length]: true }));
  };

  const removeCandidate = (idx: number) => {
    setFormCandidates(formCandidates.filter((_, i) => i !== idx));
  };

  const updateCandidateProvider = (idx: number, providerId: string) => {
    const updated = [...formCandidates];
    updated[idx] = { ...updated[idx], providerId };
    setFormCandidates(updated);
  };

  const updateCandidateModels = (idx: number, modelsStr: string) => {
    const models = modelsStr.split(",").map((m) => m.trim()).filter(Boolean);
    const updated = [...formCandidates];
    updated[idx] = { ...updated[idx], models };
    setFormCandidates(updated);
  };

  const moveCandidate = (idx: number, direction: "up" | "down") => {
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= formCandidates.length) return;
    const updated = [...formCandidates];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    setFormCandidates(updated);
  };

  const getProviderName = (id: string) => providers.find((p) => p.id === id)?.name || "未知";

  const getCandidateSummary = (candidates: RouteFallbackCandidate[] | undefined) => {
    if (!candidates || candidates.length === 0) return "无候选";
    return candidates.map((c) => `${getProviderName(c.providerId)}(${c.models.length})`).join(" → ");
  };

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

  const allProviders = providers.filter((p) => p.enabled);

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
          <CardHeader>
            <CardTitle>路由规则列表</CardTitle>
            <CardDescription>按优先级从高到低排列。Pattern 模式匹配模型名，Fallback 模式按列表顺序依次尝试</CardDescription>
          </CardHeader>
          <CardContent>
            {routes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无路由规则，点击「添加规则」开始配置
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">优先级</TableHead>
                    <TableHead>规则名称</TableHead>
                    <TableHead>模式</TableHead>
                    <TableHead>匹配/候选</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...routes].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)).map((r) => (
                    <TableRow key={r.id} className={!r.enabled ? "opacity-50" : ""}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-sm font-bold w-6 text-center">{r.priority ?? "-"}</span>
                          <div className="flex flex-col">
                            <button onClick={() => movePriority(r.id, "up")} className="text-muted-foreground hover:text-foreground leading-none"><ArrowUp className="w-3 h-3" /></button>
                            <button onClick={() => movePriority(r.id, "down")} className="text-muted-foreground hover:text-foreground leading-none"><ArrowDown className="w-3 h-3" /></button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        <Badge variant={r.mode === "fallback" ? "default" : "secondary"} className="text-xs">
                          {r.mode === "fallback" ? (
                            <><RotateCcw className="w-3 h-3 mr-1" />Fallback</>
                          ) : "Pattern"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.mode === "fallback" ? (
                          <span className="text-xs text-muted-foreground">{getCandidateSummary(r.orderedCandidates)}</span>
                        ) : (
                          <><code className="text-sm bg-muted px-2 py-0.5 rounded">{r.pattern}</code> → <Badge variant="outline">{getProviderName(r.targetProviderId || "")}</Badge></>
                        )}
                      </TableCell>
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
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRoute ? "编辑路由规则" : "添加路由规则"}</DialogTitle>
              <DialogDescription>
                {formMode === "pattern"
                  ? "配置模型名称的匹配规则和目标供应商"
                  : "配置 Fallback 顺序：按列表顺序依次尝试供应商，直到成功"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>规则名称 *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="例如：GPT 默认路由" />
              </div>

              <div className="space-y-2">
                <Label>路由模式</Label>
                <Select value={formMode} onValueChange={(v) => setFormMode(v as "pattern" | "fallback")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pattern">Pattern — 模式匹配（正则/通配符）</SelectItem>
                    <SelectItem value="fallback">Fallback — 依次尝试（顺序优先级）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Pattern：按模型名匹配规则路由到单一供应商<br />
                  Fallback：列表中的供应商按顺序依次尝试，直到某个成功
                </p>
              </div>

              {formMode === "pattern" ? (
                <>
                  <div className="space-y-2">
                    <Label>匹配模式 *</Label>
                    <Input value={formPattern} onChange={(e) => setFormPattern(e.target.value)} placeholder="例如：gpt-*（支持通配符）" />
                    <p className="text-xs text-muted-foreground">使用 * 作为通配符，例如 gpt-* 匹配所有 gpt- 开头的模型</p>
                  </div>
                  <div className="space-y-2">
                    <Label>目标供应商 *</Label>
                    <Select value={formTargetProviderId} onValueChange={setFormTargetProviderId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {allProviders.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label>触发模型名 *</Label>
                  <Input value={formPattern} onChange={(e) => setFormPattern(e.target.value)} placeholder="例如：fallback" />
                  <p className="text-xs text-muted-foreground">用户请求此模型名时触发 Fallback 路由，支持通配符如 <code>fallback*</code></p>
                </div>
              )}

              {formMode === "fallback" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Fallback 候选列表</Label>
                    <Button variant="outline" size="sm" onClick={addCandidate}><Plus className="w-4 h-4 mr-1" />添加</Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">按顺序依次尝试，排在前面的优先级最高。每个候选指定一个供应商和该供应商下可用的模型列表。</p>

                  {formCandidates.length === 0 && (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center">
                      暂无候选，点击「添加」开始
                    </div>
                  )}

                  {formCandidates.map((cand, idx) => (
                    <div key={idx} className="rounded-lg border p-3 space-y-2 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col gap-0.5">
                            <button onClick={() => moveCandidate(idx, "up")} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                            <button onClick={() => moveCandidate(idx, "down")} disabled={idx === formCandidates.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">#{idx + 1}</span>
                          {cand.providerId && <Badge variant="outline" className="text-xs">{getProviderName(cand.providerId)}</Badge>}
                          <span className="text-xs text-muted-foreground">{cand.models.length} 个模型</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setExpandedCandidates((prev) => ({ ...prev, [idx]: !prev[idx] }))}>
                            {expandedCandidates[idx] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => removeCandidate(idx)}>
                            <X className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      {expandedCandidates[idx] && (
                        <div className="space-y-2 pt-2 border-t">
                          <div className="space-y-1">
                            <Label className="text-xs">供应商</Label>
                            <Select value={cand.providerId} onValueChange={(v) => updateCandidateProvider(idx, v)}>
                              <SelectTrigger><SelectValue placeholder="选择供应商" /></SelectTrigger>
                              <SelectContent>
                                {allProviders.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name} ({p.models.length} 模型)</SelectItem>))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">可用模型（逗号分隔）</Label>
                              {cand.providerId && (() => {
                                const provider = providers.find((p) => p.id === cand.providerId);
                                return provider && provider.models.length > 0 ? (
                                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => {
                                    const updated = [...formCandidates];
                                    updated[idx] = { ...updated[idx], models: [...provider.models] };
                                    setFormCandidates(updated);
                                  }}>
                                    填充全部模型
                                  </Button>
                                ) : null;
                              })()}
                            </div>
                            <Textarea
                              value={cand.models.join(", ")}
                              onChange={(e) => updateCandidateModels(idx, e.target.value)}
                              placeholder="gpt-4o, gpt-4o-mini, deepseek-chat（输入模型名，逗号分隔）"
                              rows={2}
                              className="text-xs"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Label>优先级</Label>
                <Input value={formPriority} onChange={(e) => setFormPriority(e.target.value)} placeholder="数字越小优先级越高" type="number" />
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
