import { useCallback, useEffect, useRef, useState } from "react";
import type { SnapshotReason } from "../../../shared/types";
import { api, ApiRequestError } from "../../shared/api";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

/** 화/설정 문서 하나의 자동 저장. url은 GET/PUT 둘 다 받는 엔드포인트. */
export function useDocSave(url: string, initialText: string, initialUpdatedAt: string) {
  const text = useRef(initialText);
  const saved = useRef(initialText);
  const base = useRef(initialUpdatedAt);
  const timer = useRef<number>(undefined);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const stopped = useRef(false); // 충돌 후 버리기 등: 더 이상 저장하지 않음
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [conflict, setConflict] = useState(false);

  const save = useCallback(
    (snapshot?: SnapshotReason) => {
      window.clearTimeout(timer.current);
      const job = chain.current.then(async () => {
        if (stopped.current || (!snapshot && text.current === saved.current)) return;
        const sent = text.current;
        setStatus("saving");
        try {
          const r = await api.put<{ updatedAt: string }>(url, { text: sent, baseUpdatedAt: base.current, snapshot });
          base.current = r.updatedAt;
          saved.current = sent;
          setStatus(text.current === sent ? "saved" : "dirty");
        } catch (e) {
          setStatus("error");
          if (e instanceof ApiRequestError && e.code === "conflict") setConflict(true);
        }
      });
      chain.current = job;
      return job;
    },
    [url],
  );

  const change = useCallback(
    (t: string) => {
      text.current = t;
      if (t === saved.current) return;
      setStatus("dirty");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void save(), 1200);
    },
    [save],
  );

  /** 충돌: 서버의 최신 시각을 받아 내 글로 덮어쓴다. */
  const overwrite = useCallback(async () => {
    const latest = await api.get<{ updatedAt: string }>(url);
    base.current = latest.updatedAt;
    setConflict(false);
    await save();
  }, [url, save]);

  const stop = useCallback(() => {
    stopped.current = true;
    window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    const onHide = (e: BeforeUnloadEvent) => {
      if (stopped.current || text.current === saved.current) return;
      e.preventDefault(); // 저장 안 된 글이 있으면 브라우저가 떠날지 한 번 묻는다
      // 창을 닫는 순간에도 요청이 끝까지 가도록 keepalive
      void fetch(url, {
        method: "PUT",
        keepalive: true,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.current, baseUpdatedAt: base.current }),
      });
    };
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      void save(); // 다른 화로 옮길 때 남은 글 저장
    };
  }, [url, save]);

  return { status, conflict, change, save, overwrite, stop };
}
