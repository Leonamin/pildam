// 관계도 화면의 AI 패널: 껍데기는 AiPanelShell, 아래 영역만 관계도용이다.
// 지시 → POST /ai/edit-graph → 답(기록 영역) + 제안 카드. 카드가 남아 있는 동안 onPending으로 그림에 강조를 부탁한다.
import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { EditGraphRequest, EditGraphResponse, GraphSuggestion, NoteMeta, Work } from "../../../shared/types";
import { api } from "../../shared/api";
import { Button } from "../../shared/ui/basic/button";
import { Spinner } from "../../shared/ui/basic/spinner";
import { TextArea } from "../../shared/ui/basic/text-area";
import { AiPanelShell, type ShellContext } from "../editor/ai/AiPanelShell";
import { SuggestionList } from "./SuggestionList";

type Result = { at: number; instruction: string; reply: string; suggestions: GraphSuggestion[] };

export function GraphAiPanel({
  work, notes, chapterId, onWork, onOpenNote, apply, onPending,
}: {
  work: Work;
  notes: NoteMeta[];
  chapterId: string | null; // 시점 슬라이더의 화 (전체면 null)
  onWork: (w: Work) => void;
  onOpenNote: (noteId: string) => void;
  apply: (list: GraphSuggestion[]) => Promise<void>;
  onPending: (pending: GraphSuggestion[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  return (
    <AiPanelShell
      work={work}
      target={{ type: "graph" }}
      notes={notes}
      onWork={onWork}
      onOpenNote={onOpenNote}
      historyKey={tick}
      busy={busy}
      emptyText={<>관계도를 바꿔 달라고 말해 보세요.<br />AI가 제안하면 골라서 반영해요.</>}
      // 방금 받은 답은 전문을 말풍선으로 한 번만 보이고, 기록의 한 줄 미리보기는 대신 숨긴다.
      entryResult={(e) =>
        result && e.instruction === result.instruction && Date.parse(e.at) >= result.at - 5000 ? (
          <p className="m-0 mt-2 whitespace-pre-wrap break-words rounded-lg bg-accent-soft p-2 text-sm">{result.reply}</p>
        ) : null
      }
    >
      {(ctx) => (
        <Actions
          ctx={ctx} workId={work.id} chapters={work.chapters} chapterId={chapterId} busy={busy}
          onBusy={setBusy} onResult={(r) => { setResult(r); setTick((t) => t + 1); }}
          apply={apply} onPending={onPending} result={result}
        />
      )}
    </AiPanelShell>
  );
}

function Actions({
  ctx, workId, chapters, chapterId, busy, onBusy, onResult, apply, onPending, result,
}: {
  ctx: ShellContext;
  workId: string;
  chapters: Work["chapters"];
  chapterId: string | null;
  busy: boolean;
  onBusy: (b: boolean) => void;
  onResult: (r: Result | null) => void;
  apply: (list: GraphSuggestion[]) => Promise<void>;
  onPending: (pending: GraphSuggestion[]) => void;
  result: Result | null;
}) {
  const [text, setText] = useState("");
  const { modelId, noteIds, fail, clearFailure, setUsedNotes } = ctx;

  async function run(instruction: string) {
    if (busy || !instruction.trim()) return;
    const at = Date.now();
    onBusy(true);
    clearFailure();
    setUsedNotes([]);
    onResult(null); // 이전 카드는 거둔다 (강조도 함께 풀린다)
    try {
      const req: EditGraphRequest = { modelId, instruction: instruction.trim(), chapterId, noteIds: noteIds.length ? noteIds : undefined };
      const r = await api.post<EditGraphResponse>(`/api/works/${workId}/ai/edit-graph`, req);
      setUsedNotes(r.usedNotes);
      onResult({ at, instruction: req.instruction, reply: r.reply, suggestions: r.suggestions });
      setText("");
    } catch (e) {
      fail(e, () => void run(instruction));
    } finally {
      onBusy(false);
    }
  }

  return (
    <>
      {result && result.suggestions.length > 0 && (
        <section aria-label="관계도 제안" className="flex max-h-[40%] shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-line bg-surface-subtle p-3">
          <SuggestionList
            key={result.at}
            workId={workId} chapters={chapters} suggestions={result.suggestions}
            apply={apply} onPending={onPending} onError={ctx.fail}
          />
        </section>
      )}
      <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void run(text); }}>
        {ctx.attach}
        <TextArea
          label="관계도를 어떻게 바꿀까요?"
          description="예: 8화부터 무겸과 이헌을 동맹으로 바꿔 줘"
          value={text}
          rows={3}
          disabled={busy}
          placeholder="관계도를 어떻게 바꿀까요?"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void run(text);
            }
          }}
        />
        {busy ? (
          <div className="flex items-center gap-3">
            <Spinner size="small" label="생각하는 중" />
            <span className="text-sm">생각하는 중…</span>
          </div>
        ) : (
          <Button type="submit" className="min-h-11 self-start" disabled={!text.trim() || !modelId}>
            <Sparkles size={16} aria-hidden="true" /> AI에게 맡기기
          </Button>
        )}
      </form>
    </>
  );
}
