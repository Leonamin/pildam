import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { BookText, Ellipsis, Network, NotebookPen, Palette, Plus } from "lucide-react";
import type { ChapterMeta, DocName, Work } from "../../../shared/types";
import { api } from "../../shared/api";
import { Button, IconButton } from "../../shared/ui/basic/button";
import { TextField } from "../../shared/ui/basic/text-field";
import { Dialog } from "../../shared/ui/overlays/dialog";
import { Menu } from "../../shared/ui/overlays/menu";
import { ConfirmDialog } from "../../shared/ui/composed/confirm-dialog";
import { useToast } from "../../shared/ui/overlays/toast";
import { DOC_INFO } from "./Manuscript";

const DOC_ICON: Record<DocName, React.ReactNode> = {
  world: <BookText size={18} aria-hidden="true" />,
  style: <Palette size={18} aria-hidden="true" />,
  notes: <NotebookPen size={18} aria-hidden="true" />,
};

export function Outline({
  work, chapterId, docName, onWork, onSelectChapter, onSelectDoc, onAdd, onDeleted,
}: {
  work: Work;
  chapterId: string | null;
  docName: DocName | null;
  onWork: (w: Work) => void;
  onSelectChapter: (id: string) => void;
  onSelectDoc: (name: DocName) => void;
  onAdd: () => Promise<void>;
  onDeleted: (id: string) => void;
}) {
  const { notify } = useToast();
  const [renameWork, setRenameWork] = useState(false);
  const [renaming, setRenaming] = useState<ChapterMeta | null>(null);
  const [deleting, setDeleting] = useState<ChapterMeta | null>(null);
  const [adding, setAdding] = useState(false);
  const fail = (e: unknown) => notify({ title: e instanceof Error ? e.message : "처리하지 못했어요.", tone: "error" });

  async function move(i: number, d: -1 | 1) {
    const ids = work.chapters.map((c) => c.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    try {
      onWork(await api.patch<Work>(`/api/works/${work.id}`, { chapterOrder: ids }));
    } catch (e) {
      fail(e);
    }
  }

  return (
    <nav aria-label="목차" className="flex h-full flex-col gap-5 overflow-y-auto px-3 pt-4 pb-28">
      <div className="flex items-center justify-between gap-1 px-2">
        <h2 className="m-0 font-manuscript text-lg leading-snug font-semibold">{work.title}</h2>
        <IconButton label="작품 이름 바꾸기" onClick={() => setRenameWork(true)}>
          <Ellipsis size={18} aria-hidden="true" />
        </IconButton>
      </div>

      <section aria-labelledby="ol-ch" className="flex flex-col gap-1">
        <h3 id="ol-ch" className="m-0 px-2 text-xs font-semibold text-muted">원고</h3>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {work.chapters.map((c, i) => (
            <li key={c.id} className="flex items-center">
              <button
                type="button"
                onClick={() => onSelectChapter(c.id)}
                aria-current={c.id === chapterId && !docName ? "page" : undefined}
                className={`flex min-h-11 min-w-0 flex-1 cursor-pointer items-center rounded-lg border-0 px-3 text-left text-sm text-ink ${
                  c.id === chapterId && !docName ? "bg-accent-soft font-semibold" : "bg-transparent hover:bg-black/5"
                }`}
              >
                <span className="truncate">{i + 1}화 · {c.title}</span>
              </button>
              <Menu
                trigger={<IconButton label={`${i + 1}화 메뉴`}><Ellipsis size={16} aria-hidden="true" /></IconButton>}
                items={[
                  { label: "이름 바꾸기", onSelect: () => setRenaming(c) },
                  { label: "위로 옮기기", onSelect: () => void move(i, -1), isDisabled: i === 0 },
                  { label: "아래로 옮기기", onSelect: () => void move(i, 1), isDisabled: i === work.chapters.length - 1 },
                  { label: "삭제", onSelect: () => setDeleting(c), isDangerous: true },
                ]}
              />
            </li>
          ))}
        </ul>
        <Button variant="secondary" className="mt-1 min-h-11" isLoading={adding} onClick={async () => { setAdding(true); try { await onAdd(); } catch (e) { fail(e); } finally { setAdding(false); } }}>
          <Plus size={16} aria-hidden="true" /> 새 화
        </Button>
      </section>

      <section aria-labelledby="ol-set" className="flex flex-col gap-0.5">
        <h3 id="ol-set" className="m-0 px-2 pb-1 text-xs font-semibold text-muted">설정</h3>
        {(Object.keys(DOC_INFO) as DocName[]).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onSelectDoc(n)}
            aria-current={docName === n ? "page" : undefined}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-0 px-3 text-left text-sm text-ink ${docName === n ? "bg-accent-soft font-semibold" : "bg-transparent hover:bg-black/5"}`}
          >
            {DOC_ICON[n]} {DOC_INFO[n].title}
          </button>
        ))}
        <Link to={`/works/${work.id}/graph`} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-ink no-underline hover:bg-black/5">
          <Network size={18} aria-hidden="true" /> 관계도
        </Link>
      </section>

      <NameDialog
        heading="작품 이름"
        isOpen={renameWork}
        onClose={() => setRenameWork(false)}
        initial={work.title}
        onSubmit={async (title) => onWork(await api.patch<Work>(`/api/works/${work.id}`, { title }))}
      />
      <NameDialog
        heading="화 이름"
        isOpen={!!renaming}
        onClose={() => setRenaming(null)}
        initial={renaming?.title ?? ""}
        onSubmit={async (title) => {
          if (!renaming) return;
          await api.patch(`/api/works/${work.id}/chapters/${renaming.id}`, { title });
          onWork(await api.get<Work>(`/api/works/${work.id}`));
        }}
      />
      <ConfirmDialog
        isOpen={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="이 화를 지울까요?"
        description={`「${deleting?.title ?? ""}」이(가) 사라져요. 되돌릴 수 없어요.`}
        onConfirm={async () => {
          if (!deleting) return;
          await api.delete(`/api/works/${work.id}/chapters/${deleting.id}`);
          onWork(await api.get<Work>(`/api/works/${work.id}`));
          onDeleted(deleting.id);
        }}
      />
    </nav>
  );
}

function NameDialog({ heading, isOpen, onClose, initial, onSubmit }: {
  heading: string; isOpen: boolean; onClose: () => void; initial: string; onSubmit: (t: string) => Promise<void>;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={(o) => !o && onClose()} title={heading}>
      {isOpen && <NameForm key={initial} initial={initial} onClose={onClose} onSubmit={onSubmit} />}
    </Dialog>
  );
}

function NameForm({ initial, onClose, onSubmit }: { initial: string; onClose: () => void; onSubmit: (t: string) => Promise<void> }) {
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = v.trim();
    if (!t || pending) return;
    setPending(true);
    try {
      await onSubmit(t);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했어요.");
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TextField label="이름" value={v} onChange={(e) => setV(e.target.value)} error={error} maxLength={100} autoFocus onFocus={(e) => e.target.select()} />
      <div className="gc-actions">
        <Button variant="secondary" onClick={onClose} disabled={pending}>취소</Button>
        <Button type="submit" isLoading={pending} disabled={!v.trim()}>바꾸기</Button>
      </div>
    </form>
  );
}

