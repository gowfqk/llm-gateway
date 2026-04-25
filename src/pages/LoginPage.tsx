import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Lock, Mail, Loader2, Cloud } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { signIn, signInWithDemo, signUp, type AuthUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function LoginPage({ onAuth }: { onAuth: (user: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const navigate = useNavigate();

  // 一键登录演示账号
  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      const { user } = await signInWithDemo();
      if (user) {
        console.log("演示账号登录成功");
        onAuth({ id: user.id, email: user.email || null });
      }
    } catch (err: unknown) {
      console.error(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      console.error("请输入邮箱和密码");
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { user } = await signUp(email, password);
        if (user) {
          console.log("注册成功，请检查邮箱确认");
          if (user.email) {
            console.log("确认后可直接登录");
          }
        }
      } else {
        const { user } = await signIn(email, password);
        if (user) {
          console.log("登录成功");
          onAuth({ id: user.id, email: user.email || null });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "操作失败";
      if (message.includes("Invalid login credentials")) {
        console.error("邮箱或密码错误");
      } else if (message.includes("Email not confirmed")) {
        console.error("请先确认邮箱");
      } else {
        console.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/4 w-48 h-48 bg-violet-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 right-1/3 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />

        <div className="relative z-10 flex flex-col justify-center px-16 xl:px-24">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(220 70% 70%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">LLM Gateway</h1>
              <p className="text-xs text-indigo-300/60">智能 API 网关管理平台</p>
            </div>
          </div>

          <h2 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
            统一管理<br />
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
              所有 LLM API
            </span>
          </h2>
          <p className="text-lg text-indigo-200/60 max-w-md mb-12 leading-relaxed">
            聚合 OpenAI、Anthropic、Google 等主流厂商，
            以及 OpenRouter、Cloudflare 等免费平台，
            一站式管理、监控和路由分发。
          </p>

          <div className="space-y-4">
            {[
              { icon: "🌐", title: "多厂商支持", desc: "14+ 主流 LLM 供应商一键接入" },
              { icon: "☁️", title: "云端同步", desc: "数据存储在 Supabase，换设备不丢失" },
              { icon: "📊", title: "用量统计", desc: "实时监控 Token 消耗与费用" },
              { icon: "🔀", title: "智能路由", desc: "自动分发与故障降级" },
            ].map((item) => (
              <div key={item.title} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <p className="text-white font-medium">{item.title}</p>
                  <p className="text-sm text-indigo-200/50">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(220 70% 50%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="text-lg font-bold">LLM Gateway</h1>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">{isSignUp ? "创建账号" : "欢迎回来"}</h2>
            <p className="text-muted-foreground">
              {isSignUp ? "注册新账号开始使用" : "登录到你的网关管理面板"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="admin@llmgateway.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
              <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">记住我（7 天）</Label>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />{isSignUp ? "注册中..." : "登录中..."}</>) : (isSignUp ? "注册" : "登录")}
            </Button>
          </form>

          {/* Demo login */}
          <div className="space-y-3">
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">或</span></div>
            </div>
            <Button variant="outline" className="w-full" onClick={handleDemoLogin} disabled={loading}>
              <Cloud className="w-4 h-4 mr-2" />
              一键体验演示账号
            </Button>
          </div>

          {/* Toggle sign up / login */}
          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? "已有账号？" : "没有账号？"}{" "}
            <button className="text-primary hover:underline font-medium" onClick={() => setIsSignUp(!isSignUp)}>
              {isSignUp ? "立即登录" : "立即注册"}
            </button>
          </p>

          {/* Cloud info */}
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <div className="flex items-start gap-3">
              <Cloud className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">数据持久化</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isSupabaseConfigured()
                    ? "已连接 Supabase 云端，数据自动同步，换设备登录即可恢复"
                    : "未配置 Supabase，数据保存在浏览器本地（IndexedDB），换设备会丢失"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
