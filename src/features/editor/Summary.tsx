import { useState } from "react";
import { Check, X } from "lucide-react";
import type { ChapterMeta, Graph, GraphSuggestion } from "../../../shared/types";
import { api } from "../../shared/api";
import { Button } from "../../shared/ui/basic/button";
import { useToast } from "../../shared/ui/overlays/toast";
import { applySuggestions, describeSuggestion } from "../graph/suggestions";

export type SummaryResult = { chapterLabel: string; summary: string; suggestions: GraphSuggestion[] };

export function SummaryCards({ workId, chapters = [], result, onClose }: { workId: string; chapters?: ChapterMeta[]; result: SummaryResult; onClose: () => void }) {
  const { notify } = useToast();
  const [state, setState] = useState<("pending" | "applied" | "ignored")[]>(result.suggestions.map(() => "pending"));
  const [busy, setBusy] = useState(false);

  async function apply(idx: number[]) {
    setBusy(true);
    try {
      const graph = await api.get<Graph>(`/api/works/${workId}/graph`);
      const next = applySuggestions(graph, idx.map((i) => result.suggestions[i]));
      await api.put(`/api/works/${workId}/graph`, { graph: next, baseUpdatedAt: graph.updatedAt });
      setState((s) => s.map((v, i) => (idx.includes(i) ? "applied" : v)));
      notify({ title: "관계도에 반영했어요", tone: "success" });
    } catch (e) {
      notify({ title: e instanceof Error ? e.message : "반영하지 못했어요.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  const pending = state.flatMap((v, i) => (v === "pending" ? [i] : []));

  return (
    <section aria-label="정리 결과" className="flex flex-col gap-3 rounded-xl border border-line bg-surface-subtle p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">{result.chapterLabel} 정리</h3>
        <button type="button" aria-label="닫기" onClick={onClose} className="grid min-h-8 min-w-8 cursor-pointer place-items-center border-0 bg-transparent text-muted"><X size={16} aria-hidden="true" /></button>
      </div>
      <p className="m-0 text-sm leading-relaxed">{result.summary}</p>
      {result.suggestions.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <h4 className="m-0 text-sm font-semibold">관계도에 반영할까요?</h4>
            {pending.length > 1 && <Button className="min-h-9" disabled={busy} onClick={() => void apply(pending)}>모두 반영</Button>}
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {result.suggestions.map((s, i) => {
              const d = describeSuggestion(s, chapters);
              return (
              <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-2 text-sm">
                <span className="min-w-0"><b>{d.head}</b> · {d.body}</span>
                {state[i] === "pending" ? (
                  <span className="flex shrink-0 gap-1">
                    <Button className="min-h-9" disabled={busy} onClick={() => void apply([i])}>반영</Button>
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
      )}
    </section>
  );
}
