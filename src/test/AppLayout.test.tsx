import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppLayout from "@/components/AppLayout";

vi.mock("@/lib/auth", () => ({
  signOut: vi.fn(),
}));

const renderWithRouter = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("AppLayout", () => {
  const onLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render sidebar with navigation items", () => {
    renderWithRouter(
      <AppLayout userEmail="admin@llmgateway.com" onLogout={onLogout}>
        <div data-testid="child-content">Content</div>
      </AppLayout>
    );

    expect(screen.getByText(/概览/i)).toBeInTheDocument();
    expect(screen.getByText(/供应商/i)).toBeInTheDocument();
    expect(screen.getByText(/路由规则/i)).toBeInTheDocument();
    expect(screen.getByText(/用量日志/i)).toBeInTheDocument();
    expect(screen.getByText(/设置/i)).toBeInTheDocument();
  });

  it("should render logo", () => {
    renderWithRouter(
      <AppLayout userEmail="admin@llmgateway.com" onLogout={onLogout}>
        <div>Content</div>
      </AppLayout>
    );

    expect(screen.getByText("LLM Gateway")).toBeInTheDocument();
  });

  it("should render user info in sidebar", () => {
    renderWithRouter(
      <AppLayout userEmail="admin@llmgateway.com" onLogout={onLogout}>
        <div>Content</div>
      </AppLayout>
    );

    expect(screen.getByText("admin@llmgateway.com")).toBeInTheDocument();
    expect(screen.getByText("管理员")).toBeInTheDocument();
  });

  it("should render children content", () => {
    renderWithRouter(
      <AppLayout userEmail="admin@llmgateway.com" onLogout={onLogout}>
        <div data-testid="child-content">Test Content</div>
      </AppLayout>
    );

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("should have collapse button", () => {
    renderWithRouter(
      <AppLayout userEmail="admin@llmgateway.com" onLogout={onLogout}>
        <div>Content</div>
      </AppLayout>
    );

    expect(screen.getByText("收起")).toBeInTheDocument();
  });
});
