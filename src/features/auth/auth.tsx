import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet } from "react-router";
import type { Me } from "../../../shared/types";
import { api } from "../../shared/api";
import { Spinner } from "../../shared/ui/basic/spinner";

type Auth = { me: Me; setMe: (m: Me | null) => void };
const Ctx = createContext<{ me: Me | null; loading: boolean; setMe: (m: Me | null) => void } | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get<Me>("/api/me").then(setMe, () => setMe(null)).finally(() => setLoading(false));
  }, []);
  return <Ctx value={{ me, loading, setMe }}>{children}</Ctx>;
}

export function useAuthState() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider 필요");
  return c;
}

/** 로그인된 화면 안에서 사용. */
export function useAuth(): Auth {
  const { me, setMe } = useAuthState();
  if (!me) throw new Error("로그인 필요");
  return { me, setMe };
}

export function logout(setMe: (m: Me | null) => void) {
  return api.post("/api/logout").finally(() => setMe(null));
}

export function RequireAuth() {
  const { me, loading } = useAuthState();
  if (loading)
    return (
      <div className="grid h-dvh place-items-center bg-bg">
        <Spinner />
      </div>
    );
  return me ? <Outlet /> : <Navigate to="/login" replace />;
}
