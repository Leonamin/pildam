import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import type { Chapter, DocName, SnapshotReason, TextDoc } from "../../../shared/types";
import { api } from "../../shared/api";
import { useApi } from "../../shared/useApi";
import { Alert } from "../../shared/ui/basic/alert";
import { Button } from "../../shared/ui/basic/button";
import { Skeleton } from "../../shared/ui/basic/skeleton";
import { Dialog } from "../../shared/ui/overlays/dialog";
import { AiMarks } from "./marks";
import { docToText, textToDoc } from "./text";
import { useDocSave, type SaveStatus } from "./useChapter";
import "./editor.css";

export type EditorBridge = {
  editor: Editor;
  /** 지금 원고를 저장(snapshot이 있으면 덮어쓰기 전 본문을 스냅샷으로 남김). */
  save: (snapshot?: SnapshotReason) => Promise<unknown>;
  getText: () => string;
};

export const DOC_INFO: Record<DocName, { title: string; hint: string }> = {
  world: { title: "세계관", hint: "예: 비가 자주 내리는 작은 항구 도시. 사람들은 서로를 이름 대신 별명으로 부른다." },
  style: { title: "문체", hint: "예: 1인칭, 담담한 말투, 짧은 문장" },
  notes: { title: "메모", hint: "AI가 읽지 않는 나만의 메모를 적어 두세요." },
};

export type Target = { kind: "chapter"; id: string; title: string } | { kind: "doc"; name: DocName };

const STATUS_TEXT: Record<SaveStatus, string> = { saved: "저장됨", dirty: "저장 전", saving: "저장 중…", error: "저장 실패" };

export function Manuscript({
  workId, target, onTitle, onReady,
}: {
  workId: string;
  target: Target;
  onTitle: (title: string) => Promise<void>;
  onReady: (bridge: EditorBridge | null) => void;
}) {
  const url =
    target.kind === "chapter" ? `/api/works/${workId}/chapters/${target.id}` : `/api/works/${workId}/docs/${target.name}`;
  const { data, error, loading, reload } = useApi(async (s) => {
    const r = await api.get<Chapter | TextDoc>(url, s);
    return { url, text: r.text, updatedAt: r.updatedAt };
  }, [url]);

  if (error)
    return (
      <div className="mx-auto max-w-[720px] p-6">
        <Alert title="불러오지 못했어요" tone="danger" action={<Button variant="secondary" className="mt-3 min-h-11" onClick={reload}>다시 시도</Button>}>
          {error.message}
        </Alert>
      </div>
    );
  if (loading || !data || data.url !== url)
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-3 p-8" aria-busy="true">
        <Skeleton width="40%" height={32} />
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton width="70%" height={20} />
      </div>
    );
  return (
    <EditorView key={url} url={url} target={target} text={data.text} updatedAt={data.updatedAt} onTitle={onTitle} onReady={onReady} onReload={reload} />
  );
}

function EditorView({
  url, target, text, updatedAt, onTitle, onReady, onReload,
}: {
  url: string;
  target: Target;
  text: string;
  updatedAt: string;
  onTitle: (title: string) => Promise<void>;
  onReady: (bridge: EditorBridge | null) => void;
  onReload: () => void;
}) {
  const doc = useDocSave(url, text, updatedAt);
  const info = target.kind === "doc" ? DOC_INFO[target.name] : null;
  const editor = useEditor({
    extensions: [Document, Paragraph, Text, UndoRedo, AiMarks, Placeholder.configure({ placeholder: info ? info.hint : "여기에 이야기를 적거나, AI에게 장면을 부탁해 보세요." })],
    content: textToDoc(text),
    editorProps: { attributes: { class: "manuscript-editor", "aria-label": "원고", spellcheck: "false" } },
    onUpdate: ({ editor }) => doc.change(docToText(editor.state.doc)),
    onBlur: () => void doc.save(),
  });
  const { save } = doc;
  const bridge = useMemo(
    () => editor && { editor, save, getText: () => docToText(editor.state.doc) },
    [editor, save],
  );
  useEffect(() => {
    onReady(bridge);
    return () => onReady(null);
  }, [bridge, onReady]);

  return (
    <div className="mx-auto w-full max-w-[760px] px-3 py-6 md:px-6 md:py-10">
      <article className="rounded-2xl border border-line bg-paper px-6 py-8 shadow-sm md:px-14 md:py-12">
        <header className="mb-8 border-b border-line pb-4">
          {target.kind === "chapter" ? (
            <TitleInput key={target.id} value={target.title} onCommit={onTitle} />
          ) : (
            <h1 className="m-0 font-manuscript text-2xl font-bold">{info!.title}</h1>
          )}
          <p className="m-0 mt-2 text-sm text-muted" aria-live="polite">
            {STATUS_TEXT[doc.status]}
            {doc.status === "error" && !doc.conflict && (
              <>
                {" · "}
                <button type="button" className="min-h-8 cursor-pointer border-0 bg-transparent p-0 text-accent underline" onClick={() => void doc.save()}>
                  다시 시도
                </button>
              </>
            )}
          </p>
        </header>
        <EditorContent editor={editor} />
      </article>
      <Dialog
        isOpen={doc.conflict}
        onOpenChange={() => {}}
        title="다른 곳에서 먼저 고쳤어요"
        description="다른 기기나 창에서 이 글을 이미 바꿨어요. 어느 쪽을 남길까요?"
        shouldCloseOnOutsideClick={false}
        shouldCloseOnEscape={false}
      >
        <div className="gc-actions">
          <Button variant="secondary" onClick={() => { doc.stop(); onReload(); }}>최신 글 불러오기</Button>
          <Button onClick={() => void doc.overwrite()}>내 글로 덮어쓰기</Button>
        </div>
      </Dialog>
    </div>
  );
}

function TitleInput({ value, onCommit }: { value: string; onCommit: (t: string) => Promise<void> }) {
  const [v, setV] = useState(value);
  const commit = () => {
    const t = v.trim();
    if (!t) return setV(value);
    if (t !== value) void onCommit(t).catch(() => setV(value));
  };
  return (
    <input
      aria-label="화 제목"
      value={v}
      maxLength={100}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="w-full border-0 bg-transparent p-0 font-manuscript text-2xl font-bold text-ink outline-offset-4"
    />
  );
}
