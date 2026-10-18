import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { ArrowDownToLine, Check, ChevronLeft, ChevronRight, Eye, MessageSquarePlus, RefreshCw, X } from "lucide-react";
import type { RewriteAction, RewriteResponse } from "../../../shared/types";
import { api } from "../../shared/api";
import { Button } from "../../shared/ui/basic/button";
import { Spinner } from "../../shared/ui/basic/spinner";
import { replaceWithText, setDiff } from "./marks";
import { useMedia } from "../../shared/useMedia";
import { docToText, pmToOffset } from "./text";

type Range = { from: number; to: number };
type Run = Range & { action: RewriteAction; instruction?: string };
type Phase =
  | { t: "custom"; range: Range }
  | { t: "loading"; run: Run }
  | { t: "diff"; run: Run; cands: string[]; i: number }
  | { t: "error"; run: Run; msg: string };

const ACTIONS: { action: RewriteAction; label: string; icon: ReactNode }[] = [
  { action: "rewrite", label: "다시 쓰기", icon: <RefreshCw size={16} aria-hidden="true" /> },
  { action: "continue", label: "이어 쓰기", icon: <ArrowDownToLine size={16} aria-hidden="true" /> },
  { action: "describe", label: "묘사 더하기", icon: <Eye size={16} aria-hidden="true" /> },
  { action: "custom", label: "직접 요청", icon: <MessageSquarePlus size={16} aria-hidden="true" /> },
];

export function SelectionRewrite({
  editor, workId, chapterId, modelId, disabled, save,
}: {
  editor: Editor;
  workId: string;
  chapterId: string;
  modelId: string;
  disabled: boolean;
  save: (snapshot?: "ai-rewrite") => Promise<unknown>;
}) {
  const [sel, setSel] = useState<Range | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [instruction, setInstruction] = useState("");
  const ctl = useRef<AbortController>(null);
  const down = useRef(false);
  const busy = phase !== null;

  const refresh = useCallback(() => {
    const { from, to, empty } = editor.state.selection;
    setSel(empty || disabled || !editor.isEditable ? null : { from, to });
  }, [editor, disabled]);

  useEffect(() => {
    if (busy) return;
    const onDown = () => (down.current = true);
    const onUp = () => {
      down.current = false;
      setTimeout(refresh, 0);
    };
    const onSel = () => down.current || refresh();
    editor.view.dom.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    editor.on("selectionUpdate", onSel);
    return () => {
      editor.view.dom.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      editor.off("selectionUpdate", onSel);
    };
  }, [editor, busy, refresh]);

  useEffect(() => {
    if (disabled) setSel(null);
  }, [disabled]);

  const finish = useCallback(
    (focus = true) => {
      ctl.current?.abort();
      setDiff(editor, null);
      editor.setEditable(true);
      setPhase(null);
      setSel(null);
      setInstruction("");
      if (focus) editor.commands.focus();
    },
    [editor],
  );

  useEffect(() => {
    if (!busy) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, finish]);
  useEffect(() => () => { ctl.current?.abort(); }, []);

  async function run(r: Run) {
    ctl.current?.abort();
    const c = (ctl.current = new AbortController());
    setPhase({ t: "loading", run: r });
    setDiff(editor, null);
    editor.setEditable(false);
    try {
      await save(); // 서버에 현재 원고를 맞춰 둬야 적용 때 스냅샷이 정확하다
      const { doc } = editor.state;
      const manuscript = docToText(doc);
      const start = pmToOffset(doc, r.from);
      const end = pmToOffset(doc, r.to);
      const res = await api.post<RewriteResponse>(
        `/api/works/${workId}/ai/rewrite`,
        { chapterId, modelId, manuscript, selection: { text: manuscript.slice(start, end), start, end }, action: r.action, instruction: r.instruction },
        c.signal,
      );
      if (!res.candidates.length) throw new Error("후보를 받지 못했어요. 다시 해 주세요.");
      setPhase({ t: "diff", run: r, cands: res.candidates, i: 0 });
      showDiff(r, res.candidates[0]);
    } catch (e) {
      if (c.signal.aborted) return;
      setPhase({ t: "error", run: r, msg: e instanceof Error ? e.message : "문제가 생겼어요." });
    }
  }
  const showDiff = (r: Run, cand: string) =>
    setDiff(editor, { range: { from: r.from, to: r.to }, candidate: cand, insert: r.action === "continue" });

  function go(i: number) {
    if (phase?.t !== "diff") return;
    const n = (i + phase.cands.length) % phase.cands.length;
    setPhase({ ...phase, i: n });
    showDiff(phase.run, phase.cands[n]);
  }

  async function apply() {
    if (phase?.t !== "diff") return;
    const { run: r, cands, i } = phase;
    setDiff(editor, null);
    editor.setEditable(true);
    const at = r.action === "continue" ? r.to : r.from;
    const end = replaceWithText(editor, at, r.to, cands[i]);
    editor.commands.setTextSelection(end);
    setPhase(null);
    setSel(null);
    editor.commands.focus();
    void save("ai-rewrite");
  }

  const anchor = phase ? (phase.t === "custom" ? phase.range.to : phase.run.to) : sel?.to;
  if (anchor === undefined) return null;
  const keepSel = (e: React.MouseEvent) => e.preventDefault();

  return (
    <Floating editor={editor} pos={anchor}>
      {!phase && sel && (
        <div className="flex flex-wrap gap-1" onMouseDown={keepSel} role="toolbar" aria-label="선택한 글 고치기">
          {ACTIONS.map((a) => (
            <Button
              key={a.action}
              variant="secondary"
              className="min-h-11"
              disabled={!modelId}
              onClick={() => { if (a.action === "custom") { editor.setEditable(false); setPhase({ t: "custom", range: sel }); } else void run({ ...sel, action: a.action }); }}
            >
              {a.icon} {a.label}
            </Button>
          ))}
        </div>
      )}
      {phase?.t === "custom" && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (instruction.trim()) void run({ ...phase.range, action: "custom", instruction: instruction.trim() });
          }}
        >
          <input
            autoFocus
            aria-label="요청"
            placeholder="예: 더 담담하게"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="gc-input min-w-0 flex-1"
          />
          <Button type="submit" disabled={!instruction.trim()}>보내기</Button>
          <Button variant="secondary" aria-label="취소" onClick={() => finish()}><X size={16} aria-hidden="true" /></Button>
        </form>
      )}
      {phase?.t === "loading" && (
        <div className="flex items-center gap-3 py-1">
          <Spinner size="small" label="AI가 쓰는 중" />
          <span className="text-sm">AI가 쓰는 중…</span>
          <Button variant="secondary" className="ml-auto" onClick={() => finish()}>취소</Button>
        </div>
      )}
      {phase?.t === "error" && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="m-0 text-sm text-danger">{phase.msg}</p>
          <div className="gc-actions">
            <Button variant="secondary" onClick={() => finish()}>닫기</Button>
            <Button onClick={() => void run(phase.run)}>다시 시도</Button>
          </div>
        </div>
      )}
      {phase?.t === "diff" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1" aria-label="후보 넘기기">
            <Button variant="secondary" aria-label="이전 후보" disabled={phase.cands.length < 2} onClick={() => go(phase.i - 1)}><ChevronLeft size={16} aria-hidden="true" /></Button>
            <span className="min-w-10 text-center text-sm" aria-live="polite">{phase.i + 1}/{phase.cands.length}</span>
            <Button variant="secondary" aria-label="다음 후보" disabled={phase.cands.length < 2} onClick={() => go(phase.i + 1)}><ChevronRight size={16} aria-hidden="true" /></Button>
          </div>
          <Button onClick={() => void apply()}><Check size={16} aria-hidden="true" /> 적용</Button>
          <Button variant="secondary" onClick={() => finish()}><X size={16} aria-hidden="true" /> 취소</Button>
          <Button variant="secondary" onClick={() => void run(phase.run)}><RefreshCw size={16} aria-hidden="true" /> 다시 쓰기</Button>
        </div>
      )}
    </Floating>
  );
}

/** 데스크탑: 글 위치 근처에 뜨는 카드. 모바일: 아래 시트. */
function Floating({ editor, pos, children }: { editor: Editor; pos: number; children: ReactNode }) {
  const mobile = useMedia("(max-width: 767px)");
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });
  const place = useCallback(() => {
    try {
      const c = editor.view.coordsAtPos(pos);
      const w = Math.min(470, window.innerWidth - 24);
      const left = Math.max(12, Math.min(c.left - 40, window.innerWidth - w - 12));
      const below = c.bottom + 150 < window.innerHeight;
      setStyle({ left, width: w, ...(below ? { top: c.bottom + 10 } : { top: c.top - 10, transform: "translateY(-100%)" }) });
    } catch {
      /* 위치를 못 구하면 숨김 유지 */
    }
  }, [editor, pos]);
  useLayoutEffect(() => {
    if (mobile) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [mobile, place]);
  return (
    <div
      role="dialog"
      aria-label="AI 글 고치기"
      style={mobile ? undefined : style}
      className={`z-50 border border-line bg-surface p-2 shadow-[var(--gc-shadow)] ${
        mobile ? "fixed inset-x-0 bottom-0 rounded-t-2xl p-4 pb-6" : "fixed rounded-xl"
      }`}
    >
      {children}
    </div>
  );
}
