// 문체·노트용 AI 영역: "어떻게 고칠까요?" → POST /ai/edit-doc → 문서 위에 문단별 비교로 보여 주고 [적용][취소][다시].
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, RefreshCw, Sparkles, Square, X } from "lucide-react";
import type { AiTarget, EditDocRequest, EditDocResponse } from "../../../../shared/types";
import { api } from "../../../shared/api";
import { Button } from "../../../shared/ui/basic/button";
import { Spinner } from "../../../shared/ui/basic/spinner";
import { TextArea } from "../../../shared/ui/basic/text-area";
import { useToast } from "../../../shared/ui/overlays/toast";
import type { EditorBridge } from "../Manuscript";
import { diffParagraphs, type Hunk } from "../docDiff";
import { setDocDiff } from "../marks";
import { splitParagraphs, textToDoc } from "../text";
import type { ShellContext } from "./AiPanelShell";

type Shown = { text: string; hunks: Hunk[] };

export function DocActions({
  workId, target, bridge, ctx, busy, onBusy, onShowManuscript, onDone,
}: {
  workId: string;
  target: Extract<AiTarget, { type: "style" | "note" }>;
  bridge: EditorBridge | null;
  ctx: ShellContext;
  busy: boolean;
  onBusy: (b: boolean) => void;
  onShowManuscript: () => void; // 모바일: 결과를 보여 줄 원고 화면으로 옮긴다
  onDone: () => void; // 기록 다시 불러오기
}) {
  const { notify } = useToast();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const ctl = useRef<AbortController>(null);
  const editor = bridge?.editor ?? null;
  const { modelId, noteIds, setUsedNotes } = ctx;

  const clear = () => {
    if (!editor || editor.isDestroyed) return;
    setDocDiff(editor, null);
    editor.setEditable(true);
  };
  const cancel = () => {
    ctl.current?.abort();
    clear();
    setShown(null);
    setLoading(false);
    onBusy(false);
  };
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  // 다른 문서로 옮기면 보이던 비교를 거둔다.
  useEffect(() => () => cancelRef.current(), []);
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancelRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown]);

  async function run() {
    if (!bridge || !editor || loading || !text.trim()) return;
    const c = (ctl.current = new AbortController());
    ctx.clearFailure();
    setUsedNotes([]);
    setShown(null);
    setDocDiff(editor, null);
    setLoading(true);
    onBusy(true);
    editor.setEditable(false);
    let keep = false; // 비교를 보여 주는 동안은 계속 바쁨
    try {
      await bridge.save();
      const old: string[] = [];
      editor.state.doc.forEach((p) => old.push(p.textContent));
      const req: EditDocRequest = { target, modelId, instruction: text.trim(), text: bridge.getText(), noteIds: noteIds.length ? noteIds : undefined };
      const res = await api.post<EditDocResponse>(`/api/works/${workId}/ai/edit-doc`, req, c.signal);
      setUsedNotes(res.usedNotes);
      onDone();
      const next = res.text.trim();
      const hunks = diffParagraphs(old, splitParagraphs(next));
      if (!hunks.length) {
        notify({ title: "바뀐 곳이 없어요", tone: "info" });
        clear();
        return;
      }
      onShowManuscript();
      setDocDiff(editor, hunks);
      setShown({ text: next, hunks });
      keep = true;
      // 모바일에서 원고 화면이 다시 보이는 데 한 박자 걸린다
      window.setTimeout(() => editor.view.dom.querySelector(".ai-del, .ai-add-block")?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    } catch (e) {
      if (c.signal.aborted) return;
      clear();
      ctx.fail(e, () => void run());
    } finally {
      if (!c.signal.aborted) {
        setLoading(false);
        if (!keep) onBusy(false);
      }
    }
  }

  async function apply() {
    if (!shown || !bridge || !editor) return;
    const next = shown.text;
    setDocDiff(editor, null);
    editor.setEditable(true);
    editor.commands.setContent(textToDoc(next), { emitUpdate: true });
    setShown(null);
    onBusy(false);
    setText("");
    await bridge.save();
  }

  const working = loading || !!shown;
  return (
    <>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        {ctx.attach}
        <TextArea
          label="어떻게 고칠까요?"
          value={text}
          rows={3}
          disabled={!bridge || working || busy}
          placeholder={target.type === "style" ? "예: 문장을 더 짧고 담담하게" : "예: 인물 이름을 표로 정리해 줘"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void run();
            }
          }}
        />
        {loading ? (
          <div className="flex items-center gap-3">
            <Spinner size="small" label="고치는 중" />
            <span className="text-sm">고치는 중…</span>
            <Button variant="secondary" className="ml-auto min-h-11" onClick={cancel}>
              <Square size={14} aria-hidden="true" /> 멈추기
            </Button>
          </div>
        ) : (
          <Button type="submit" className="min-h-11 self-start" disabled={!bridge || working || !text.trim() || !modelId}>
            <Sparkles size={16} aria-hidden="true" /> AI에게 고치게 하기
          </Button>
        )}
      </form>
      {shown &&
        createPortal(
          <div
            role="dialog"
            aria-label="AI가 고친 내용"
            className="fixed bottom-24 left-1/2 z-50 flex w-[calc(100vw-32px)] max-w-md -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-[var(--gc-shadow)]"
          >
            <span className="px-1 text-sm">고친 곳 {shown.hunks.length}군데</span>
            <span className="ml-auto flex gap-2">
              <Button onClick={() => void apply()}><Check size={16} aria-hidden="true" /> 적용</Button>
              <Button variant="secondary" onClick={cancel}><X size={16} aria-hidden="true" /> 취소</Button>
              <Button variant="secondary" onClick={() => void run()}><RefreshCw size={16} aria-hidden="true" /> 다시</Button>
            </span>
          </div>,
          document.body,
        )}
    </>
  );
}
