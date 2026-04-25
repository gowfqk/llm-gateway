import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProviders, useUsage, useDailyUsage } from "@/hooks/useData";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ArrowUpRight, ArrowDownRight, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const CHART_COLORS = ["hsl(220 70% 50%)", "hsl(160 60% 45%)", "hsl(30 80% 55%)", "hsl(280 65% 60%)", "hsl(340 75% 55%)", "hsl(190 50% 50%)"];

function KPISkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-28 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function DashboardPage({ onLogout, userEmail }: { onLogout: () => void; userEmail: string }) {
  const { data: providers, loading: loadingProviders } = useProviders();
  const { data: usage, loading: loadingUsage } = useUsage();
  const dailyUsage = useDailyUsage(usage);

  if (loadingProviders || loadingUsage) {
    return (
      <AppLayout userEmail={userEmail} onLogout={onLogout}>
        <div className="space-y-6">
          <div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-48 mt-2" />
          </div>
          <KPISkeleton />
        </div>
      </AppLayout>
    );
  }

  const enabledProviders = providers.filter((p) => p.enabled);
  const totalRequests = usage.length;
  const totalTokens = usage.reduce((s, r) => s + r.totalTokens, 0);
  const totalCost = usage.reduce((s, r) => s + r.cost, 0);
  const avgLatency = usage.length > 0 ? usage.reduce((s, r) => s + r.latency, 0) / usage.length : 0;
  const successRate = usage.length > 0 ? (usage.filter((r) => r.status === "success").length / usage.length) * 100 : 0;

  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");
  const todayUsage = dailyUsage.find((d) => d.date === today);
  const yesterdayUsage = dailyUsage.find((d) => d.date === yesterday);
  const tokenChange = yesterdayUsage && yesterdayUsage.totalTokens > 0
    ? ((todayUsage?.totalTokens || 0) - yesterdayUsage.totalTokens) / yesterdayUsage.totalTokens
    : 0;
  const costChange = yesterdayUsage && yesterdayUsage.totalCost > 0
    ? ((todayUsage?.totalCost || 0) - yesterdayUsage.totalCost) / yesterdayUsage.totalCost
    : 0;

  const providerDistribution = enabledProviders.map((p) => {
    const pUsage = usage.filter((r) => r.providerId === p.id);
    return {
      name: p.name,
      tokens: pUsage.reduce((s, r) => s + r.totalTokens, 0),
      cost: pUsage.reduce((s, r) => s + r.cost, 0),
      count: pUsage.length,
    };
  }).filter((p) => p.count > 0).sort((a, b) => b.tokens - a.tokens);

  const statusCounts = {
    success: usage.filter((r) => r.status === "success").length,
    error: usage.filter((r) => r.status === "error").length,
    rate_limited: usage.filter((r) => r.status === "rate_limited").length,
  };

  const trendData = dailyUsage.map((d) => ({
    date: format(parseISO(d.date), "MM/dd"),
    tokens: d.totalTokens,
    cost: Math.round(d.totalCost * 100) / 100,
    requests: d.requestCount,
  }));

  const recentRecords = usage.slice(0, 8);

  return (
    <AppLayout userEmail={userEmail} onLogout={onLogout}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
          <p className="text-muted-foreground mt-1">LLM API 网关运行状态总览</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>总请求数</CardDescription>
              <CardTitle className="text-2xl font-bold">{totalRequests.toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm">
                {tokenChange >= 0 ? <ArrowUpRight className="w-4 h-4 text-emerald-600" /> : <ArrowDownRight className="w-4 h-4 text-red-600" />}
                <span className={cn(tokenChange >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {Math.abs(tokenChange * 100).toFixed(1)}%
                </span>
                <span className="text-muted-foreground">较昨日</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>总 Token 消耗</CardDescription>
              <CardTitle className="text-2xl font-bold">{(totalTokens / 1_000_000).toFixed(2)}M</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-muted-foreground">平均 {totalRequests > 0 ? (totalTokens / totalRequests).toFixed(0) : 0} tokens/请求</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>总费用</CardDescription>
              <CardTitle className="text-2xl font-bold">${totalCost.toFixed(2)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm">
                {costChange >= 0 ? <ArrowUpRight className="w-4 h-4 text-emerald-600" /> : <ArrowDownRight className="w-4 h-4 text-red-600" />}
                <span className={cn(costChange >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {Math.abs(costChange * 100).toFixed(1)}%
                </span>
                <span className="text-muted-foreground">较昨日</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>平均延迟</CardDescription>
              <CardTitle className="text-2xl font-bold">{avgLatency.toFixed(0)}ms</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-muted-foreground">成功率 {successRate.toFixed(1)}%</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">30 天用量趋势</CardTitle>
              <CardDescription>每日 Token 消耗</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(0 0% 100%)", border: "1px solid hsl(214.3 31.8% 91.4%)", borderRadius: "8px", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="tokens" stackId="1" stroke="hsl(220 70% 50%)" fill="hsl(220 70% 50% / 0.15)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">供应商用量分布</CardTitle>
              <CardDescription>按 Token 消耗占比</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={providerDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="tokens" nameKey="name">
                    {providerDistribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${(value / 1000).toFixed(0)}K tokens`} contentStyle={{ backgroundColor: "hsl(0 0% 100%)", border: "1px solid hsl(214.3 31.8% 91.4%)", borderRadius: "8px", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {providerDistribution.map((p, i) => (
                  <div key={p.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-muted-foreground">{p.name}</span>
                    </div>
                    <span className="font-medium">{totalTokens > 0 ? ((p.tokens / totalTokens) * 100).toFixed(1) : 0}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Status & Recent */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">请求状态分布</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" />成功</span>
                    <span className="font-medium">{statusCounts.success}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${totalRequests > 0 ? (statusCounts.success / totalRequests) * 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />限流</span>
                    <span className="font-medium">{statusCounts.rate_limited}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${totalRequests > 0 ? (statusCounts.rate_limited / totalRequests) * 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />错误</span>
                    <span className="font-medium">{statusCounts.error}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${totalRequests > 0 ? (statusCounts.error / totalRequests) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">最近请求</CardTitle>
              <CardDescription>最近的 API 调用记录</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentRecords.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant={r.status === "success" ? "default" : r.status === "error" ? "destructive" : "secondary"} className="text-xs shrink-0">
                        {r.status === "success" ? "成功" : r.status === "error" ? "错误" : "限流"}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.model}</p>
                        <p className="text-xs text-muted-foreground">{r.providerName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm shrink-0">
                      <div className="text-right"><p className="font-medium">{(r.totalTokens / 1000).toFixed(1)}K</p><p className="text-xs text-muted-foreground">tokens</p></div>
                      <div className="text-right"><p className="font-medium">${r.cost.toFixed(3)}</p><p className="text-xs text-muted-foreground">费用</p></div>
                      <div className="text-right"><p className="font-medium">{r.latency}ms</p><p className="text-xs text-muted-foreground">延迟</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
