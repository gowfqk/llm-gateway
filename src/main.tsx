import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App.tsx";
import "./index.css";
import { loadRuntimeConfig } from "./lib/runtime-config";

const queryClient = new QueryClient();

// 在 render 之前先加载运行时配置（Supabase URL/key 等）。
// 这样 supabase.ts 的 isSupabaseConfigured() / Proxy 初始化都能拿到正确的值，
// 不再依赖 Vite 构建期的 VITE_* 注入。
loadRuntimeConfig().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster richColors position="top-right" closeButton />
    </QueryClientProvider>
  );
});
