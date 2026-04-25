import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsPage from "@/pages/SettingsPage";

const mockLoadGatewayConfig = vi.hoisted(() => vi.fn());
const mockSaveGatewayConfig = vi.hoisted(() => vi.fn());
const mockExportConfigurationData = vi.hoisted(() => vi.fn());
const mockImportConfigurationData = vi.hoisted(() => vi.fn());
const mockClearUsageLogs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gateway-config", () => ({
  loadGatewayConfig: mockLoadGatewayConfig,
  saveGatewayConfig: mockSaveGatewayConfig,
  getProxyUrl: (config: { proxyUrl?: string }) => config.proxyUrl?.trim() || "",
  generateGatewayApiKey: () => "gw_live_sk_regenerated",
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
}));

vi.mock("@/lib/store", () => ({
  exportConfigurationData: mockExportConfigurationData,
  importConfigurationData: mockImportConfigurationData,
  clearUsageLogs: mockClearUsageLogs,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage onLogout={vi.fn()} userEmail="admin" />
    </MemoryRouter>
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExportConfigurationData.mockResolvedValue({});
    mockImportConfigurationData.mockResolvedValue(undefined);
    mockClearUsageLogs.mockResolvedValue(undefined);
    mockLoadGatewayConfig.mockResolvedValue({
      proxyUrl: "",
      apiKeys: ["gw_live_sk_existing"],
    });
  });

  it("should load persisted gateway api keys instead of hard-coded demo key", async () => {
    renderPage();

    expect(await screen.findByDisplayValue("gw_live_sk_existing")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("gw_live_sk_7f8a9b2c3d4e5f6g")).not.toBeInTheDocument();
  });

  it("should persist regenerated api key when saving settings", async () => {
    renderPage();

    await screen.findByDisplayValue("gw_live_sk_existing");

    fireEvent.click(screen.getByRole("button", { name: /重新生成/i }));
    fireEvent.click(screen.getByRole("button", { name: /保存设置/i }));

    await waitFor(() => {
      expect(mockSaveGatewayConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeys: expect.arrayContaining([expect.stringMatching(/^gw_live_sk_/)]),
        })
      );
    });
  });

  it("should clear usage logs without deleting configuration", async () => {
    renderPage();

    await screen.findByDisplayValue("gw_live_sk_existing");

    fireEvent.click(screen.getByRole("button", { name: /清空日志/i }));

    await waitFor(() => {
      expect(mockClearUsageLogs).toHaveBeenCalledTimes(1);
    });
  });
});
