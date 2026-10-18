import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { ToastProvider } from "../shared/ui/overlays/toast";
import { AuthProvider, RequireAuth } from "../features/auth/auth";
import { LoginPage } from "../features/auth/LoginPage";
import { HomePage } from "../features/works/HomePage";
import { WorkspacePage } from "../features/editor/WorkspacePage";
import { GraphPage } from "../features/graph/GraphPage";

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/works/:workId" element={<WorkspacePage />} />
              <Route path="/works/:workId/graph" element={<GraphPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
