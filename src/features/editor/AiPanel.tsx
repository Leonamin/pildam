import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { History, ListChecks, Sparkles, Square, Undo2 } from "lucide-react";
import type { AiTarget, ChapterMeta, ChatEntry, NoteMeta, SnapshotMeta, SnapshotReason, SummarizeResponse, WriteRequest, Work } from "../../../shared/types";
import { api, ApiRequestError, streamNdjson } from "../../shared/api";
import { useApi } from "../../shared/useApi";
import { relativeTime } from "../../shared/time";
import { Alert } from "../../shared/ui/basic/alert";
import { Button } from "../../shared/ui/basic/button";
import { Spinner } from "../../shared/ui/basic/spinner";
import { TextArea } from "../../shared/ui/basic/text-area";
import { Drawer } from "../../shared/ui/overlays/dialog";
import { useToast } from "../../shared/ui/overlays/toast";
import type { EditorBridge } from "./Manuscript";
import { SummaryCards, type SummaryResult } from "./Summary";
import { AiPanelShell, type ShellContext } from "./ai/AiPanelShell";
import { DocActions } from "./ai/DocActions";
import { fadeAiBlock, getAiBlock, openTail, replaceWithText } from "./marks";
import { textToDoc } from "./text";

const REASON_LABEL: Record<SnapshotReason, string> = { "ai-write": "AI가 쓰기 전", "ai-rewrite": "AI가 고치기 전", restore: "되돌리기 전", manual: "직접 저장" };

/** 에디터 끝(또는 쓰는 자리)이 화면 아래에 가려지면 따라 내려간다. */
function follow(editor: Editor, pos: number) {
  try {
    const { node } = editor.view.domAtPos(pos);
    const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement);
    if (el && el.getBoundingClientRect().bottom > window.innerHeight - 170) el.scrollIntoView({ block: "center" });
  } catch {
    /* 위치를 못 찾으면 그대로 */
  }
}

/** 작업 화면의 오른쪽 패널. 대상(화·문체·노트)에 따라 아래 영역만 달라지고 껍데기는 AiPanelShell이다. */
export function AiPanel({
  work, notes, target, previous, bridge, onWork, onBusy, askSummary, onAskDone, onOpenNote, onShowManuscript,
}: {
  work: Work;
  notes: NoteMeta[];
  target: Exclude<AiTarget, { type: "graph" }> | null;
  previous: ChapterMeta | null;
  bridge: EditorBridge | null; // target의 에디터일 때만 넘긴다
  onWork: (w: Work) => void;
  onBusy: (b: boolean) => void;
  askSummary: boolean;
  onAskDone: () => void;
  onOpenNote: (noteId: string) => void;
  onShowManuscript: () => void;
}) {
  const { notify } = useToast();
  const base = `/api/works/${work.id}`;
  const chapter = target?.type === "chapter" ? work.chapters.find((c) => c.id === target.chapterId) ?? null : null;
  const chapterId = chapter?.id ?? "";
  const [tick, setTick] = useState(0);
  const [busy, setBusyState] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const setBusy = useCallback((b: boolean) => { setBusyState(b); onBusy(b); }, [onBusy]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const { data: snaps } = useApi((s) => (chapterId ? api.get<SnapshotMeta[]>(`${base}/chapters/${chapterId}/snapshots`, s) : Promise.resolve([])), [chapterId, tick]);

  async function restore(snapshotId: string) {
    if (!bridge) return;
    try {
      const { text: old } = await api.get<{ text: string }>(`${base}/chapters/${chapterId}/snapshots/${snapshotId}`);
      await bridge.save();
      bridge.editor.commands.setContent(textToDoc(old), { emitUpdate: true });
      await bridge.save("restore");
      reload();
      notify({ title: "이전 글로 되돌렸어요", tone: "success" });
    } catch (e) {
      notify({ title: e instanceof Error ? e.message : "되돌리지 못했어요.", tone: "error" });
    }
  }

  /** 기록 한 줄에 맞는 "쓰기 전" 스냅샷(시각이 가장 가까운 것). */
  function snapshotFor(e: ChatEntry): SnapshotMeta | undefined {
    const reason = e.kind === "rewrite" ? "ai-rewrite" : e.kind === "write" || e.kind === "revise" ? "ai-write" : null;
    if (!reason) return undefined;
    const t = new Date(e.at).getTime();
    const near = (snaps ?? []).filter((s) => s.reason === reason).map((s) => [Math.abs(new Date(s.createdAt).getTime() - t), s] as const).sort((a, b) => a[0] - b[0])[0];
    return near && near[0] < 120_000 ? near[1] : undefined;
  }

  return (
    <>
      <AiPanelShell
        work={work}
        target={target}
        notes={notes}
        onWork={onWork}
        onOpenNote={onOpenNote}
        historyKey={tick}
        busy={busy}
        header={chapter && (
          <Button variant="secondary" className="min-h-9 self-end" onClick={() => setShowHistory(true)}>
            <History size={16} aria-hidden="true" /> 이전 버전
          </Button>
        )}
        entryActions={(e) => {
          const snap = chapter ? snapshotFor(e) : undefined;
          return snap && (
            <Button variant="secondary" className="mt-2 min-h-9" disabled={busy} onClick={() => void restore(snap.id)}>
              <Undo2 size={14} aria-hidden="true" /> 되돌리기
            </Button>
          );
        }}
        emptyText={!target ? "화를 열면 AI와 함께 쓸 수 있어요." : chapter ? <>아이디어만 적어 주세요.<br />AI가 원고에 바로 써 줘요.</> : "원하는 대로 고치라고 해 보세요."}
      >
        {(ctx) =>
          !target ? null : target.type === "chapter" ? (
            chapter && (
              <ChapterActions
                key={chapter.id}
                work={work} chapter={chapter} previous={previous} bridge={bridge} ctx={ctx}
                busy={busy} setBusy={setBusy} onWork={onWork} reload={reload}
                askSummary={askSummary} onAskDone={onAskDone}
              />
            )
          ) : (
            <DocActions
              key={target.type === "note" ? target.noteId : "style"}
              workId={work.id} target={target} bridge={bridge} ctx={ctx}
              busy={busy} onBusy={setBusy} onShowManuscript={onShowManuscript} onDone={reload}
            />
          )
        }
      </AiPanelShell>
      {showHistory && chapter && <HistoryDrawer base={`${base}/chapters/${chapterId}`} onClose={() => setShowHistory(false)} onRestore={async (id) => { await restore(id); setShowHistory(false); }} />}
    </>
  );
}

function ChapterActions({
  work, chapter, previous, bridge, ctx, busy: panelBusy, setBusy: setPanelBusy, onWork, reload, askSummary, onAskDone,
}: {
  work: Work;
  chapter: ChapterMeta;
  previous: ChapterMeta | null;
  bridge: EditorBridge | null;
  ctx: ShellContext;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onWork: (w: Work) => void;
  reload: () => void;
  askSummary: boolean;
  onAskDone: () => void;
}) {
  const base = `/api/works/${work.id}`;
  const chapterId = chapter.id;
  const { modelId, noteIds, fail, clearFailure, setUsedNotes } = ctx;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"write" | "summarize" | null>(null);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [hasBlock, setHasBlock] = useState(false);
  const ctl = useRef<AbortController>(null);
  const fadeTimer = useRef<number>(undefined);
  const editor = bridge?.editor ?? null;

  useEffect(() => {
    if (!editor) {
      setHasBlock(false);
      return;
    }
    const update = () => setHasBlock(!!getAiBlock(editor));
    update();
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
      window.clearTimeout(fadeTimer.current);
    };
  }, [editor]);
  // 쓰는 중에 다른 화로 옮기면 멈춘다(안 그러면 옮기기 전 화에만 글이 반쯤 남는다).
  useEffect(() => () => { ctl.current?.abort(); }, []);

  async function write(mode: "continue" | "revise", instruction: string) {
    if (!bridge || !editor || busy || !instruction.trim()) return;
    const block = mode === "revise" ? getAiBlock(editor) : null;
    if (mode === "revise" && !block) return;
    const c = (ctl.current = new AbortController());
    clearFailure();
    setUsedNotes([]);
    setBusy("write");
    setPanelBusy(true);
    window.clearTimeout(fadeTimer.current);
    let wrote = false;
    try {
      await bridge.save(); // 서버 본문을 지금 원고와 맞춰 둔다(아래 스냅샷이 이 상태를 담는다)
      editor.setEditable(false);
      const req: WriteRequest = {
        chapterId, modelId, instruction: instruction.trim(), mode, manuscript: bridge.getText(),
        reviseTarget: block ? editor.state.doc.textBetween(block.from, block.to, "\n\n") : undefined,
        noteIds: noteIds.length ? noteIds : undefined,
      };
      let acc = "";
      let from = block?.from ?? -1;
      let to = block?.to ?? -1;
      await streamNdjson(`${base}/ai/write`, req, (ev) => {
        if (ev.t === "error") throw new ApiRequestError(ev.error, ev.message);
        if (ev.t === "notes") return setUsedNotes(ev.titles);
        if (ev.t !== "delta") return;
        acc += ev.text;
        const t = acc.replace(/^\s+/, "");
        if (!t) return;
        if (from < 0) from = to = openTail(editor);
        to = replaceWithText(editor, from, to, t, true);
        wrote = true;
        follow(editor, to);
      }, c.signal);
      setText("");
    } catch (e) {
      c.abort();
      if (!(e instanceof DOMException && e.name === "AbortError")) fail(e, () => void write(mode, instruction));
    } finally {
      editor.setEditable(true);
      if (wrote) {
        await bridge.save("ai-write");
        fadeTimer.current = window.setTimeout(() => fadeAiBlock(editor), 4000);
      }
      reload();
      setBusy(null);
      setPanelBusy(false);
    }
  }

  async function summarize(id: string, label: string) {
    if (busy) return;
    setBusy("summarize");
    setPanelBusy(true);
    clearFailure();
    onAskDone();
    try {
      if (id === chapterId) await bridge?.save();
      const r = await api.post<SummarizeResponse>(`${base}/ai/summarize`, { chapterId: id, modelId });
      setSummary({ chapterLabel: label, summary: r.summary, suggestions: r.suggestions });
      onWork(await api.get<Work>(base));
    } catch (e) {
      fail(e, () => void summarize(id, label));
    } finally {
      setBusy(null);
      setPanelBusy(false);
    }
  }

  const disabled = !bridge || !!busy || panelBusy;
  const prevIndex = previous ? work.chapters.findIndex((c) => c.id === previous.id) + 1 : 0;

  return (
    <>
      {summary && <SummaryCards workId={work.id} chapters={work.chapters} result={summary} onClose={() => setSummary(null)} />}

      {askSummary && previous && (
        <Alert
          title={`${prevIndex}화를 정리해 둘까요?`}
          tone="neutral"
          onDismiss={onAskDone}
          action={
            <Button variant="secondary" className="mt-2 min-h-11" disabled={disabled} onClick={() => void summarize(previous.id, `${prevIndex}화`)}>
              <ListChecks size={16} aria-hidden="true" /> 정리하기
            </Button>
          }
        >
          정리해 두면 AI가 앞 이야기를 기억하고 이어 써요.
        </Alert>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void write("continue", text);
        }}
      >
        {ctx.attach}
        <TextArea
          label="어떤 장면을 쓸까요?"
          value={text}
          rows={3}
          disabled={disabled}
          placeholder="예: 주인공이 비 오는 날 옛 연인을 마주쳐"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void write("continue", text);
            }
          }}
        />
        {busy === "write" ? (
          <div className="flex items-center gap-3">
            <Spinner size="small" label="쓰는 중" />
            <span className="text-sm">쓰는 중…</span>
            <Button variant="secondary" className="ml-auto min-h-11" onClick={() => ctl.current?.abort()}>
              <Square size={14} aria-hidden="true" /> 멈추기
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11" disabled={disabled || !text.trim() || !modelId}>
              <Sparkles size={16} aria-hidden="true" /> 이어 쓰기
            </Button>
            {hasBlock && (
              <Button variant="secondary" className="min-h-11" disabled={disabled || !text.trim() || !modelId} onClick={() => void write("revise", text)}>
                방금 쓴 부분 고치기
              </Button>
            )}
            <Button variant="secondary" className="min-h-11" isLoading={busy === "summarize"} disabled={disabled} onClick={() => void summarize(chapterId, "이 화")}>
              <ListChecks size={16} aria-hidden="true" /> 이 화 정리하기
            </Button>
          </div>
        )}
      </form>
    </>
  );
}

function HistoryDrawer({ base, onClose, onRestore }: { base: string; onClose: () => void; onRestore: (id: string) => Promise<void> }) {
  const { data, error, loading } = useApi((s) => api.get<SnapshotMeta[]>(`${base}/snapshots`, s), [base]);
  const [busyId, setBusyId] = useState("");
  const run = useCallback(async (id: string) => {
    setBusyId(id);
    await onRestore(id);
    setBusyId("");
  }, [onRestore]);
  return (
    <Drawer isOpen onOpenChange={(o) => !o && onClose()} title="이전 버전" description="되돌려도 지금 글은 이전 버전에 남아요.">
      {loading ? <Spinner /> : error ? <Alert title="불러오지 못했어요" tone="danger">{error.message}</Alert> : data && data.length === 0 ? (
        <p className="m-0 text-sm text-muted">아직 이전 버전이 없어요.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {data?.map((s) => (
            <li key={s.id} className="rounded-xl border border-line p-3 text-sm">
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span className="font-semibold text-ink">{REASON_LABEL[s.reason]}</span>
                <time dateTime={s.createdAt}>{relativeTime(s.createdAt)}</time>
              </div>
              <p className="m-0 mt-1 line-clamp-3 font-manuscript">{s.preview || "(빈 원고)"}</p>
              <Button variant="secondary" className="mt-2 min-h-9" isLoading={busyId === s.id} disabled={!!busyId} onClick={() => void run(s.id)}>
                <Undo2 size={14} aria-hidden="true" /> 되돌리기
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
