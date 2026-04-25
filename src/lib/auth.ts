import { supabase } from "./supabase";

export interface AuthUser {
  id: string;
  email: string | null;
}

// 默认演示账号 - 密码通过环境变量配置，避免硬编码
const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL || "admin@llmgateway.com";
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || "";

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithDemo() {
  // 尝试用演示账号登录，如果账号不存在则先注册
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (!error && data.user) return data;
  } catch {
    // 账号不存在，先注册
  }

  // 注册演示账号
  const { data, error } = await supabase.auth.signUp({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email || null };
}

export function onAuthChange(callback: (user: AuthUser | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      callback({ id: session.user.id, email: session.user.email || null });
    } else {
      callback(null);
    }
  });
  return data.subscription;
}
