import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { ChapterMeta, Graph, GraphSuggestion } from "../../../shared/types";
import { api } from "../../shared/api";
import { Button } from "../../shared/ui/basic/button";
import { useToast } from "../../shared/ui/overlays/toast";
import { applySuggestions, describeSuggestion } from "./suggestions";

/** 기본 반영: 최신 관계도를 받아 제안을 얹고 저장한다. (관계도 화면은 자기 저장과 겹치지 않게 apply를 따로 넘긴다.) */
export async function applyToServer(workId: string, list: GraphSuggestion[]) {
  const graph = await api.get<Graph>(`/api/works/${workId}/graph`);
  await api.put(`/api/works/${workId}/graph`, { graph: applySuggestions(graph, list), baseUpdatedAt: graph.updatedAt });
}

/** 관계도 제안 카드: 하나씩 [반영]/[무시], 둘 이상 남으면 [모두 반영]. 남은(pending) 제안은 onPending으로 알린다. */
export function SuggestionList({
  workId, chapters = [], suggestions, apply, onPending, onError,
}: {
  workId: string;
  chapters?: ChapterMeta[];
  suggestions: GraphSuggestion[];
  apply?: (list: GraphSuggestion[]) => Promise<void>;
  onPending?: (pending: GraphSuggestion[]) => void;
  onError?: (e: unknown, retry: () => void) => void;
}) {
  const { notify } = useToast();
  const [state, setState] = useState<("pending" | "applied" | "ignored")[]>(suggestions.map(() => "pending"));
  const [busy, setBusy] = useState(false);
  const pending = state.flatMap((v, i) => (v === "pending" ? [i] : []));
  const cb = useRef(onPending);
  cb.current = onPending;
  useEffect(() => { cb.current?.(pending.map((i) => suggestions[i])); }, [state, suggestions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cb.current?.([]), []);

  async function run(idx: number[]) {
    setBusy(true);
    try {
      const list = idx.map((i) => suggestions[i]);
      await (apply ? apply(list) : applyToServer(workId, list));
      setState((s) => s.map((v, i) => (idx.includes(i) ? "applied" : v)));
      notify({ title: "관계도에 반영했어요", tone: "success" });
    } catch (e) {
      if (onError) onError(e, () => void run(idx));
      else notify({ title: e instanceof Error ? e.message : "반영하지 못했어요.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h4 className="m-0 text-sm font-semibold">관계도에 반영할까요?</h4>
        {pending.length > 1 && <Button className="min-h-9" disabled={busy} onClick={() => void run(pending)}>모두 반영</Button>}
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {suggestions.map((s, i) => {
          const d = describeSuggestion(s, chapters);
          return (
            <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-2 text-sm">
              <span className="min-w-0"><b>{d.head}</b> · {d.body}</span>
              {state[i] === "pending" ? (
                <span className="flex shrink-0 gap-1">
                  <Button className="min-h-9" disabled={busy} onClick={() => void run([i])}>반영</Button>
                  <Button variant="secondary" className="min-h-9" disabled={busy} onClick={() => setState((v) => v.map((x, j) => (j === i ? "ignored" : x)))}>무시</Button>
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-muted">
                  {state[i] === "applied" && <Check size={14} aria-hidden="true" />}
                  {state[i] === "applied" ? "반영함" : "무시함"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
