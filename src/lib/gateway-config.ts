import { kv } from "./kv";
import type { GatewayConfig } from "@/types";
import { getCurrentUser } from "./auth";
import {
  isSupabaseConfigured,
  fetchGatewayConfig as fetchGatewayConfigFromSupabase,
  saveGatewayConfig as saveGatewayConfigToSupabase,
} from "./supabase";

export type { GatewayConfig } from "@/types";

const KEY_GATEWAY = "gateway-config";

const defaultConfig: GatewayConfig = {
  proxyUrl: "",
  apiKeys: [],
};

function normalizeGatewayConfig(config?: Partial<GatewayConfig> | null): GatewayConfig {
  return {
    proxyUrl: typeof config?.proxyUrl === "string" ? config.proxyUrl : "",
    apiKeys: Array.isArray(config?.apiKeys)
      ? [...new Set(config.apiKeys.filter((key): key is string => typeof key === "string" && key.trim().length > 0))]
      : [],
  };
}

async function getGatewayConfigUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const user = await getCurrentUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

export async function loadGatewayConfig(): Promise<GatewayConfig> {
  const userId = await getGatewayConfigUserId();

  if (userId) {
    try {
      const cloudConfig = await fetchGatewayConfigFromSupabase(userId);
      if (cloudConfig) {
        const normalized = normalizeGatewayConfig(cloudConfig);
        await kv.set(KEY_GATEWAY, normalized);
        return normalized;
      }
    } catch {
      // fallback to local cache
    }
  }

  const stored = await kv.get<GatewayConfig>(KEY_GATEWAY);
  return normalizeGatewayConfig(stored ?? defaultConfig);
}

export async function saveGatewayConfig(config: GatewayConfig): Promise<void> {
  const normalized = normalizeGatewayConfig(config);
  const userId = await getGatewayConfigUserId();

  if (userId) {
    try {
      await saveGatewayConfigToSupabase(userId, normalized);
    } catch {
      // still cache locally so settings are not lost
    }
  }

  await kv.set(KEY_GATEWAY, normalized);
}

export function getProxyUrl(config: GatewayConfig): string {
  return typeof config.proxyUrl === "string" ? config.proxyUrl.trim() : "";
}

export function generateGatewayApiKey(): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;

  return `gw_live_sk_${randomPart.slice(0, 24)}`;
}
