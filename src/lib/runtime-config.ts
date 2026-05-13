/**
 * 运行时配置加载
 *
 * 在应用启动时从 /api/config 拉取配置（Supabase URL、anon key、demo 账号等）。
 * 这样即使 Vite 构建期没注入 VITE_* 环境变量（Cloudflare Pages 的常见坑），
 * 前端也能正常工作，只要后端 Workers 能读到 env 即可。
 *
 * 同时保留对 VITE_* 构建期变量的支持，本地开发 `npm run dev` 时直接用 .env，
 * 不需要起后端。
 */

export interface RuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  demoEmail: string;
}

let cachedConfig: RuntimeConfig | null = null;
let loadPromise: Promise<RuntimeConfig> | null = null;

function fromViteEnv(): RuntimeConfig | null {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "";
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "";
  const demo = (import.meta.env.VITE_DEMO_EMAIL as string | undefined) || "";
  if (url && key) {
    return { supabaseUrl: url, supabaseAnonKey: key, demoEmail: demo };
  }
  return null;
}

async function fromApi(): Promise<RuntimeConfig> {
  try {
    const resp = await fetch("/api/config", { cache: "no-store" });
    if (!resp.ok) {
      console.warn(`[runtime-config] /api/config returned ${resp.status}`);
      return { supabaseUrl: "", supabaseAnonKey: "", demoEmail: "" };
    }
    const data = await resp.json();
    return {
      supabaseUrl: data?.supabase?.url || "",
      supabaseAnonKey: data?.supabase?.anonKey || "",
      demoEmail: data?.demo?.email || "",
    };
  } catch (err) {
    console.warn("[runtime-config] 无法加载 /api/config:", err);
    return { supabaseUrl: "", supabaseAnonKey: "", demoEmail: "" };
  }
}

/**
 * 加载运行时配置（异步）。
 * 优先使用 Vite 构建期的 VITE_* 变量（本地 dev 场景），
 * 否则从 /api/config 拉取（Cloudflare Pages 生产部署场景）。
 *
 * 结果被缓存；重复调用返回同一个 Promise/值。
 */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cachedConfig) return cachedConfig;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const fromVite = fromViteEnv();
    if (fromVite) {
      cachedConfig = fromVite;
      return fromVite;
    }
    const fromRuntime = await fromApi();
    cachedConfig = fromRuntime;
    return fromRuntime;
  })();

  return loadPromise;
}

/**
 * 同步获取已加载的配置。只能在 loadRuntimeConfig() resolve 之后调用，
 * 否则返回 null。
 */
export function getRuntimeConfig(): RuntimeConfig | null {
  return cachedConfig;
}
