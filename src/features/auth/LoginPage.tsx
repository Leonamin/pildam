import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import type { Me } from "../../../shared/types";
import { api } from "../../shared/api";
import { Alert } from "../../shared/ui/basic/alert";
import { Button } from "../../shared/ui/basic/button";
import { TextField } from "../../shared/ui/basic/text-field";
import { Wordmark } from "../../shared/ui/Wordmark";
import { useAuthState } from "./auth";

export function LoginPage() {
  const { me, setMe } = useAuthState();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (me) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const m = await api.post<Me>("/api/login", { username: username.trim(), password });
      setMe(m);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인하지 못했어요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8"
      >
        <h1 className="m-0 text-center">
          <Wordmark size="lg" />
        </h1>
        {error && <Alert title={error} tone="danger" />}
        <TextField
          label="아이디"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
        />
        <TextField
          label="비밀번호"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <Button type="submit" isLoading={pending} disabled={!username.trim() || !password} className="w-full">
          들어가기
        </Button>
      </form>
    </main>
  );
}
