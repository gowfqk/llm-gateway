import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import { signIn, signInWithDemo } from "@/lib/auth";

const mockOnAuth = vi.fn();

vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
  signInWithDemo: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: vi.fn(() => true),
}));

const mockSignIn = vi.mocked(signIn);
const mockSignInWithDemo = vi.mocked(signInWithDemo);

const renderWithRouter = () =>
  render(
    <MemoryRouter>
      <LoginPage onAuth={mockOnAuth} />
    </MemoryRouter>
  );

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render login form", () => {
    renderWithRouter();

    expect(screen.getByLabelText(/邮箱/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/密码/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^登录$/i })).toBeInTheDocument();
  });

  it("should show demo login entry", () => {
    renderWithRouter();

    expect(screen.getByRole("button", { name: /一键体验演示账号/i })).toBeInTheDocument();
    expect(screen.getByText(/数据持久化/i)).toBeInTheDocument();
  });

  it("should not proceed when submitting empty form", async () => {
    renderWithRouter();

    fireEvent.click(screen.getByRole("button", { name: /^登录$/i }));

    await waitFor(() => {
      expect(mockSignIn).not.toHaveBeenCalled();
    });
  });

  it("should show error when credentials are wrong", async () => {
    mockSignIn.mockRejectedValue(new Error("Invalid login credentials"));
    renderWithRouter();

    fireEvent.change(screen.getByLabelText(/邮箱/i), { target: { value: "wrong@example.com" } });
    fireEvent.change(screen.getByLabelText(/密码/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /^登录$/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalled();
    });
  });

  it("should login successfully with correct credentials", async () => {
    mockSignIn.mockResolvedValue({ user: { id: "user-1", email: "admin@llmgateway.com" } } as Awaited<ReturnType<typeof signIn>>);
    renderWithRouter();

    fireEvent.change(screen.getByLabelText(/邮箱/i), { target: { value: "admin@llmgateway.com" } });
    fireEvent.change(screen.getByLabelText(/密码/i), { target: { value: "test-password" } });
    fireEvent.click(screen.getByRole("button", { name: /^登录$/i }));

    await waitFor(() => {
      expect(mockOnAuth).toHaveBeenCalledWith({ id: "user-1", email: "admin@llmgateway.com" });
    });
  });

  it("should login successfully with demo account", async () => {
    mockSignInWithDemo.mockResolvedValue({ user: { id: "demo-user", email: "admin@llmgateway.com" } } as Awaited<ReturnType<typeof signInWithDemo>>);
    renderWithRouter();

    fireEvent.click(screen.getByRole("button", { name: /一键体验演示账号/i }));

    await waitFor(() => {
      expect(mockOnAuth).toHaveBeenCalledWith({ id: "demo-user", email: "admin@llmgateway.com" });
    });
  });

  it("should toggle password visibility", () => {
    renderWithRouter();

    const passwordInput = screen.getByLabelText(/密码/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    const toggleButton = document.querySelector('button[type="button"].absolute');
    expect(toggleButton).not.toBeNull();

    fireEvent.click(toggleButton!);
    expect(passwordInput).toHaveAttribute("type", "text");
  });
});
