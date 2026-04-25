import { describe, it, expect, beforeEach, vi } from "vitest";

const mockKvGet = vi.hoisted(() => vi.fn());
const mockKvSet = vi.hoisted(() => vi.fn());
const mockGetCurrentUser = vi.hoisted(() => vi.fn());
const mockIsSupabaseConfigured = vi.hoisted(() => vi.fn());
const mockFetchGatewayConfig = vi.hoisted(() => vi.fn());
const mockSaveGatewayConfigToSupabase = vi.hoisted(() => vi.fn());

vi.mock("@/lib/kv", () => ({
  kv: {
    get: mockKvGet,
    set: mockKvSet,
    del: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: mockIsSupabaseConfigured,
  fetchGatewayConfig: mockFetchGatewayConfig,
  saveGatewayConfig: mockSaveGatewayConfigToSupabase,
}));

import { loadGatewayConfig, saveGatewayConfig, getProxyUrl } from "@/lib/gateway-config";

describe("gateway-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupabaseConfigured.mockReturnValue(false);
    mockGetCurrentUser.mockResolvedValue(null);
    mockFetchGatewayConfig.mockResolvedValue(null);
    mockSaveGatewayConfigToSupabase.mockResolvedValue(undefined);
  });

  it("should provide empty api key list by default", async () => {
    mockKvGet.mockResolvedValue(undefined);

    const config = await loadGatewayConfig();

    expect(config).toEqual({
      proxyUrl: "",
      apiKeys: [],
    });
  });

  it("should load persisted gateway config from supabase when available", async () => {
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "admin@example.com" });
    mockFetchGatewayConfig.mockResolvedValue({
      proxyUrl: "https://gateway.example.com/api/proxy",
      apiKeys: ["gw_live_sk_first", "gw_live_sk_second"],
    });

    const config = await loadGatewayConfig();

    expect(mockFetchGatewayConfig).toHaveBeenCalledWith("user-1");
    expect(mockKvSet).toHaveBeenCalledWith("gateway-config", {
      proxyUrl: "https://gateway.example.com/api/proxy",
      apiKeys: ["gw_live_sk_first", "gw_live_sk_second"],
    });
    expect(config).toEqual({
      proxyUrl: "https://gateway.example.com/api/proxy",
      apiKeys: ["gw_live_sk_first", "gw_live_sk_second"],
    });
  });

  it("should persist api keys to supabase and local cache when saving config", async () => {
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "admin@example.com" });

    const config = {
      proxyUrl: "https://gateway.example.com/api/proxy",
      apiKeys: ["gw_live_sk_first", "gw_live_sk_second"],
    };

    await saveGatewayConfig(config);

    expect(mockSaveGatewayConfigToSupabase).toHaveBeenCalledWith("user-1", config);
    expect(mockKvSet).toHaveBeenCalledWith("gateway-config", config);
  });

  it("should return empty string when proxy url is empty", () => {
    expect(getProxyUrl({ proxyUrl: "", apiKeys: [] })).toBe("");
  });
});
