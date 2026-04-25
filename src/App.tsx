import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import ProvidersPage from "@/pages/ProvidersPage";
import RoutesPage from "@/pages/RoutesPage";
import UsagePage from "@/pages/UsagePage";
import SettingsPage from "@/pages/SettingsPage";
import type { AuthUser } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getCurrentUser().then((u) => {
      setUser(u);
      setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  const handleAuth = (u: AuthUser) => setUser(u);
  const handleLogout = () => setUser(null);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">正在检查登录状态...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          user ? <Navigate to="/" replace /> : <LoginPage onAuth={handleAuth} />
        } />
        <Route path="/" element={
          user ? <DashboardPage onLogout={handleLogout} /> : <Navigate to="/login" replace />
        } />
        <Route path="/providers" element={
          user ? <ProvidersPage onLogout={handleLogout} /> : <Navigate to="/login" replace />
        } />
        <Route path="/routes" element={
          user ? <RoutesPage onLogout={handleLogout} /> : <Navigate to="/login" replace />
        } />
        <Route path="/usage" element={
          user ? <UsagePage onLogout={handleLogout} /> : <Navigate to="/login" replace />
        } />
        <Route path="/settings" element={
          user ? <SettingsPage onLogout={handleLogout} /> : <Navigate to="/login" replace />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
