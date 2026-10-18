import { useMemo, type ReactNode } from "react";
import type { Preview } from "@storybook/react-vite";
import { MemoryRouter, Navigate, Route, Routes } from "react-router";
import "../src/shared/ui/styles/app.css";
import { ToastProvider } from "../src/shared/ui/overlays/toast";
import { AuthProvider, RequireAuth } from "../src/features/auth/auth";
import { LoginPage } from "../src/features/auth/LoginPage";
import { HomePage } from "../src/features/works/HomePage";
import { WorkspacePage } from "../src/features/editor/WorkspacePage";
import { GraphPage } from "../src/features/graph/GraphPage";
import { installMock, type MockOpts } from "./mock";

/** 스토리가 고르는 상태. route가 있으면 앱의 실제 라우트 표로 그 URL을 연다. */
export type PildamParams = {
  route?: string; // MemoryRouter 초기 URL (예: /works/w1?ch=c2)
  mock?: MockOpts;
  storage?: Record<string, string>; // 시작 전에 심을 localStorage
};

// App.tsx와 같은 공급자·라우트 표. BrowserRouter만 MemoryRouter로 바꿨다.
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/works/:workId" element={<WorkspacePage />} />
        <Route path="/works/:workId/graph" element={<GraphPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Frame({ route, children, auth }: { route: string; children: ReactNode; auth: boolean }) {
  const entries = useMemo(() => [route], [route]);
  return (
    <ToastProvider>
      <MemoryRouter initialEntries={entries}>
        {auth ? <AuthProvider>{children}</AuthProvider> : children}
      </MemoryRouter>
    </ToastProvider>
  );
}

const preview: Preview = {
  parameters: { layout: "fullscreen" },
  // 스토리 사이 상태 격리: pildam* localStorage 비우기 → 심기 → fetch 목 새로 설치
  loaders: [
    ({ parameters }) => {
      const p: PildamParams = parameters.pildam ?? {};
      try {
        Object.keys(localStorage).filter((k) => k.startsWith("pildam")).forEach((k) => localStorage.removeItem(k));
        Object.entries(p.storage ?? {}).forEach(([k, v]) => localStorage.setItem(k, v));
      } catch { /* storage 없는 환경 */ }
      installMock(p.mock);
      return {};
    },
  ],
  decorators: [
    (Story, { parameters, id }) => {
      const p: PildamParams = parameters.pildam ?? {};
      // route가 있으면 화면 전체(앱 라우트 표), 없으면 조각 하나를 공급자만 씌워 그린다.
      return p.route ? (
        <Frame key={id} route={p.route} auth><AppRoutes /></Frame>
      ) : (
        <Frame key={id} route="/" auth={false}><Story /></Frame>
      );
    },
  ],
};
export default preview;
