import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUsage, useProviders } from "@/hooks/useData";
import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Search, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type SortKey = "timestamp" | "model" | "totalTokens" | "cost" | "latency";
type SortDir = "asc" | "desc";

export default function UsagePage({ onLogout, userEmail }: { onLogout: () => void; userEmail: string }) {
  const { data: records, loading: loadingUsage } = useUsage();
  const { data: providers } = useProviders();
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let result = [...records];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) => r.model.toLowerCase().includes(q) || r.providerName.toLowerCase().includes(q));
    }
    if (providerFilter !== "all") result = result.filter((r) => r.providerId === providerFilter);
    if (statusFilter !== "all") result = result.filter((r) => r.status === statusFilter);
    result.sort((a, b) => {
      let aVal: number | string = "";
      let bVal: number | string = "";
      switch (sortKey) {
        case "timestamp": aVal = new Date(a.timestamp).getTime(); bVal = new Date(b.timestamp).getTime(); break;
        case "model": aVal = a.model; bVal = b.model; break;
        case "totalTokens": aVal = a.totalTokens; bVal = b.totalTokens; break;
        case "cost": aVal = a.cost; bVal = b.cost; break;
        case "latency": aVal = a.latency; bVal = b.latency; break;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [records, search, providerFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const SortIcon = ({ colKey }: { colKey: SortKey }) => {
    if (sortKey !== colKey) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 opacity-40" />;
    return <ArrowUpDown className={cn("w-3.5 h-3.5 ml-1", sortDir === "asc" ? "rotate-180" : "")} />;
  };

  if (loadingUsage) {
    return (
      <AppLayout userEmail={userEmail} onLogout={onLogout}>
        <div className="space-y-6">
          <div><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-48 mt-2" /></div>
          <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="pt-6"><Skeleton className="h-8 w-20" /><Skeleton className="h-4 w-16 mt-2" /></CardContent></Card>)}</div>
          <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout userEmail={userEmail} onLogout={onLogout}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">用量日志</h1>
          <p className="text-muted-foreground mt-1">查看和筛选所有 API 调用记录</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{filtered.length}</div><div className="text-sm text-muted-foreground">总请求数</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{(filtered.reduce((s, r) => s + r.totalTokens, 0) / 1_000_000).toFixed(2)}M</div><div className="text-sm text-muted-foreground">总 Token</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">${filtered.reduce((s, r) => s + r.cost, 0).toFixed(2)}</div><div className="text-sm text-muted-foreground">总费用</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{filtered.length > 0 ? (filtered.reduce((s, r) => s + r.latency, 0) / filtered.length).toFixed(0) : 0}ms</div><div className="text-sm text-muted-foreground">平均延迟</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">筛选与搜索</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="搜索模型或供应商..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <Select value={providerFilter} onValueChange={(v) => { setProviderFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="供应商" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部供应商</SelectItem>
                  {providers.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="状态" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="success">成功</SelectItem>
                  <SelectItem value="error">错误</SelectItem>
                  <SelectItem value="rate_limited">限流</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("totalTokens")}>
                    <span className="flex items-center">Token 数<SortIcon colKey="totalTokens" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("cost")}>
                    <span className="flex items-center">费用<SortIcon colKey="cost" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("latency")}>
                    <span className="flex items-center">延迟<SortIcon colKey="latency" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("timestamp")}>
                    <span className="flex items-center">时间<SortIcon colKey="timestamp" /></span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant={r.status === "success" ? "default" : r.status === "error" ? "destructive" : "secondary"} className="text-xs">
                        {r.status === "success" ? "成功" : r.status === "error" ? "错误" : "限流"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.model}</TableCell>
                    <TableCell className="text-muted-foreground">{r.providerName}</TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">{r.totalTokens.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground ml-1">(P:{r.promptTokens.toLocaleString()} C:{r.completionTokens.toLocaleString()})</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">${r.cost.toFixed(3)}</TableCell>
                    <TableCell>
                      <span className={cn("font-medium", r.latency > 2000 ? "text-red-500" : r.latency > 1000 ? "text-amber-500" : "text-emerald-600")}>{r.latency}ms</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(parseISO(r.timestamp), "MM/dd HH:mm:ss")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">第 {page} 页，共 {totalPages} 页（{filtered.length} 条记录）</p>
                <div className="flex items-center gap-2">
                  <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-sm rounded-md border bg-background disabled:opacity-50 hover:bg-muted transition-colors">上一页</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) pageNum = i + 1;
                    else if (page <= 3) pageNum = i + 1;
                    else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = page - 2 + i;
                    return (<button key={pageNum} onClick={() => setPage(pageNum)} className={cn("w-8 h-8 text-sm rounded-md transition-colors", page === pageNum ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{pageNum}</button>);
                  })}
                  <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm rounded-md border bg-background disabled:opacity-50 hover:bg-muted transition-colors">下一页</button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
