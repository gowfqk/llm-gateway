import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "@/App";
import { getCurrentUser } from "@/lib/auth";

vi.mock("@/pages/LoginPage", () => ({
  default: () => <div data-testid="login-page">Login Page</div>,
}));
vi.mock("@/pages/DashboardPage", () => ({
  default: () => <div data-testid="dashboard-page">Dashboard Page</div>,
}));
vi.mock("@/pages/ProvidersPage", () => ({
  default: () => <div data-testid="providers-page">Providers Page</div>,
}));
vi.mock("@/pages/RoutesPage", () => ({
  default: () => <div data-testid="routes-page">Routes Page</div>,
}));
vi.mock("@/pages/UsagePage", () => ({
  default: () => <div data-testid="usage-page">Usage Page</div>,
}));
vi.mock("@/pages/SettingsPage", () => ({
  default: () => <div data-testid="settings-page">Settings Page</div>,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

const mockGetCurrentUser = vi.mocked(getCurrentUser);

describe("App Routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("should show loading indicator while checking auth state", () => {
    mockGetCurrentUser.mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(screen.getByText("正在检查登录状态...")).toBeInTheDocument();
  });

  it("should redirect to login when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
  });

  it("should show dashboard when authenticated and on /", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "admin@llmgateway.com" });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    });
  });

  it("should redirect to login when auth check fails", async () => {
    mockGetCurrentUser.mockRejectedValue(new Error("auth failed"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
  });
});
