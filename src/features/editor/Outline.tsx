import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight, Ellipsis, Folder, Network, NotebookPen, Palette, Pin, Plus } from "lucide-react";
import type { ChapterMeta, NoteMeta, Work } from "../../../shared/types";
import { api } from "../../shared/api";
import { Button, IconButton } from "../../shared/ui/basic/button";
import { TextField } from "../../shared/ui/basic/text-field";
import { Dialog } from "../../shared/ui/overlays/dialog";
import { Menu } from "../../shared/ui/overlays/menu";
import { ConfirmDialog } from "../../shared/ui/composed/confirm-dialog";
import { useToast } from "../../shared/ui/overlays/toast";
import { Select } from "../../shared/ui/overlays/select";
import { groupByFolder } from "./ai/NotePicker";

const FOLDERS_KEY = "pildam.folders.collapsed"; // 작품별로 접은 폴더 이름 목록
const NONE = "__none";
const NEW = "__new";
const loadCollapsed = (workId: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(`${FOLDERS_KEY}.${workId}`) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const rowCls = (on: boolean) =>
  `flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border-0 px-3 text-left text-sm text-ink ${on ? "bg-accent-soft font-semibold" : "bg-transparent hover:bg-black/5"}`;

export function Outline({
  work, notes, activeKey, onWork, onNotes, onSelectChapter, onSelectStyle, onSelectNote, onAdd, onDeleted, onNoteDeleted, onSplit,
}: {
  work: Work;
  notes: NoteMeta[];
  /** 지금 열린 곳: "chapter:<id>" | "style" | "note:<id>" */
  activeKey: string;
  onWork: (w: Work) => void;
  onNotes: (n: NoteMeta[]) => void;
  onSelectChapter: (id: string) => void;
  onSelectStyle: () => void;
  onSelectNote: (id: string) => void;
  onAdd: () => Promise<void>;
  onDeleted: (id: string) => void;
  onNoteDeleted: (id: string) => void;
  onSplit: (id: string) => Promise<void>;
}) {
  const { notify } = useToast();
  const [renameWork, setRenameWork] = useState(false);
  const [renaming, setRenaming] = useState<ChapterMeta | null>(null);
  const [deleting, setDeleting] = useState<ChapterMeta | null>(null);
  const [adding, setAdding] = useState(false);
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(work.id));
  const [creating, setCreating] = useState(false);
  const [noteRename, setNoteRename] = useState<NoteMeta | null>(null);
  const [noteMove, setNoteMove] = useState<NoteMeta | null>(null);
  const [noteDelete, setNoteDelete] = useState<NoteMeta | null>(null);
  const [folderRename, setFolderRename] = useState<string | null>(null);
  const notesUrl = `/api/works/${work.id}/notes`;
  const folders = groupByFolder(notes).map(([f]) => f).filter(Boolean);
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

  const refreshNotes = async () => onNotes(await api.get<NoteMeta[]>(notesUrl));
  const toggleFolder = (f: string) =>
    setCollapsed((c) => {
      const n = c.includes(f) ? c.filter((x) => x !== f) : [...c, f];
      try { localStorage.setItem(`${FOLDERS_KEY}.${work.id}`, JSON.stringify(n)); } catch { /* 저장 못 해도 동작 */ }
      return n;
    });
  /** 같은 폴더 안에서 이웃과 자리를 바꾼다(전체 순서에서 두 노트의 자리를 맞바꿈). */
  async function moveNote(n: NoteMeta, d: -1 | 1) {
    const sib = notes.filter((x) => x.folder === n.folder);
    const other = sib[sib.indexOf(n) + d];
    if (!other) return;
    const ids = notes.map((x) => x.id);
    const a = ids.indexOf(n.id), b = ids.indexOf(other.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    try {
      onNotes(await api.patch<NoteMeta[]>(notesUrl, { order: ids }));
    } catch (e) {
      fail(e);
    }
  }
  async function patchNote(n: NoteMeta, body: Partial<Pick<NoteMeta, "title" | "folder" | "pinned">>) {
    await api.patch(`${notesUrl}/${n.id}`, body);
    await refreshNotes();
  }
  async function split(n: NoteMeta) {
    try {
      await onSplit(n.id);
    } catch (e) {
      fail(e); // 나눌 제목이 없으면 서버가 이유를 알려 준다
    }
  }
  const noteRow = (n: NoteMeta, i: number, sib: NoteMeta[], indent: boolean) => (
    <li key={n.id} className={`flex items-center ${indent ? "pl-4" : ""}`}>
      <button type="button" onClick={() => onSelectNote(n.id)} aria-current={activeKey === `note:${n.id}` ? "page" : undefined} className={rowCls(activeKey === `note:${n.id}`)}>
        <NotebookPen size={16} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{n.title}</span>
        {n.pinned && <Pin size={12} aria-label="항상 AI에 보내요" className="shrink-0 text-muted" />}
      </button>
      <Menu
        trigger={<IconButton label={`${n.title} 메뉴`}><Ellipsis size={16} aria-hidden="true" /></IconButton>}
        items={[
          { label: "이름 바꾸기", onSelect: () => setNoteRename(n) },
          { label: "폴더 옮기기", onSelect: () => setNoteMove(n) },
          { label: "위로 옮기기", onSelect: () => void moveNote(n, -1), isDisabled: i === 0 },
          { label: "아래로 옮기기", onSelect: () => void moveNote(n, 1), isDisabled: i === sib.length - 1 },
          { label: n.pinned ? "항상 AI에 보내기 끄기" : "항상 AI에 보내기", onSelect: () => void patchNote(n, { pinned: !n.pinned }).catch(fail) },
          { label: "제목별로 나누기", onSelect: () => void split(n) },
          { label: "삭제", onSelect: () => setNoteDelete(n), isDangerous: true },
        ]}
      />
    </li>
  );
  // 폴더는 첫 노트가 있는 자리에, 폴더 없는 노트는 제자리에 둔다.
  const seen = new Set<string>();
  const tree = notes.flatMap((n) => {
    if (!n.folder) return [noteRow(n, notes.filter((x) => !x.folder).indexOf(n), notes.filter((x) => !x.folder), false)];
    if (seen.has(n.folder)) return [];
    seen.add(n.folder);
    const sib = notes.filter((x) => x.folder === n.folder);
    const shut = collapsed.includes(n.folder);
    return [
      <li key={`f:${n.folder}`} className="flex flex-col">
        <div className="flex items-center">
          <button type="button" aria-expanded={!shut} onClick={() => toggleFolder(n.folder)} className={rowCls(false)}>
            {shut ? <ChevronRight size={16} aria-hidden="true" className="shrink-0" /> : <ChevronDown size={16} aria-hidden="true" className="shrink-0" />}
            <Folder size={16} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{n.folder}</span>
            <span className="text-xs text-muted">{sib.length}</span>
          </button>
          <Menu
            trigger={<IconButton label={`${n.folder} 폴더 메뉴`}><Ellipsis size={16} aria-hidden="true" /></IconButton>}
            items={[{ label: "이름 바꾸기", onSelect: () => setFolderRename(n.folder) }]}
          />
        </div>
        {!shut && <ul className="m-0 flex list-none flex-col gap-0.5 p-0">{sib.map((x, i) => noteRow(x, i, sib, true))}</ul>}
      </li>,
    ];
  });

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
                aria-current={activeKey === `chapter:${c.id}` ? "page" : undefined}
                className={`flex min-h-11 min-w-0 flex-1 cursor-pointer items-center rounded-lg border-0 px-3 text-left text-sm text-ink ${
                  activeKey === `chapter:${c.id}` ? "bg-accent-soft font-semibold" : "bg-transparent hover:bg-black/5"
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
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          <li className="flex">
            <button type="button" onClick={onSelectStyle} aria-current={activeKey === "style" ? "page" : undefined} className={rowCls(activeKey === "style")}>
              <Palette size={18} aria-hidden="true" className="shrink-0" /> 문체
            </button>
          </li>
          {tree}
        </ul>
        <Button variant="secondary" className="mt-1 min-h-11" onClick={() => setCreating(true)}>
          <Plus size={16} aria-hidden="true" /> 노트
        </Button>
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
      <NoteFormDialog
        heading="새 노트"
        submitLabel="만들기"
        isOpen={creating}
        onClose={() => setCreating(false)}
        folders={folders}
        withTitle
        initialFolder=""
        onSubmit={async (title, folder) => {
          const n = await api.post<NoteMeta>(notesUrl, { title, folder });
          await refreshNotes();
          onSelectNote(n.id);
        }}
      />
      <NoteFormDialog
        heading="폴더 옮기기"
        submitLabel="옮기기"
        isOpen={!!noteMove}
        onClose={() => setNoteMove(null)}
        folders={folders}
        initialFolder={noteMove?.folder ?? ""}
        onSubmit={async (_t, folder) => { if (noteMove) await patchNote(noteMove, { folder }); }}
      />
      <NameDialog
        heading="노트 이름"
        isOpen={!!noteRename}
        onClose={() => setNoteRename(null)}
        initial={noteRename?.title ?? ""}
        onSubmit={async (title) => { if (noteRename) await patchNote(noteRename, { title }); }}
      />
      <NameDialog
        heading="폴더 이름"
        isOpen={folderRename !== null}
        onClose={() => setFolderRename(null)}
        initial={folderRename ?? ""}
        onSubmit={async (name) => {
          if (folderRename === null || name === folderRename) return;
          // 폴더는 노트에 적힌 이름일 뿐이라, 안의 노트를 하나씩 옮긴다.
          for (const n of notes.filter((x) => x.folder === folderRename)) await api.patch(`${notesUrl}/${n.id}`, { folder: name });
          setCollapsed((c) => c.map((x) => (x === folderRename ? name : x)));
          await refreshNotes();
        }}
      />
      <ConfirmDialog
        isOpen={!!noteDelete}
        onOpenChange={(o) => !o && setNoteDelete(null)}
        title="이 노트를 지울까요?"
        description={`「${noteDelete?.title ?? ""}」이(가) 사라져요. 되돌릴 수 없어요.`}
        onConfirm={async () => {
          if (!noteDelete) return;
          await api.delete(`${notesUrl}/${noteDelete.id}`);
          await refreshNotes();
          onNoteDeleted(noteDelete.id);
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


/** 폴더 고르기(있는 폴더 / 폴더 없음 / 새 폴더…). 제목도 받으려면 withTitle. */
function NoteFormDialog({ heading, submitLabel, isOpen, onClose, folders, withTitle, initialFolder, onSubmit }: {
  heading: string; submitLabel: string; isOpen: boolean; onClose: () => void; folders: string[]; withTitle?: boolean;
  initialFolder: string; onSubmit: (title: string, folder: string) => Promise<unknown>;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={(o) => !o && onClose()} title={heading}>
      {isOpen && <NoteForm key={initialFolder} {...{ submitLabel, onClose, folders, withTitle, initialFolder, onSubmit }} />}
    </Dialog>
  );
}

function NoteForm({ submitLabel, onClose, folders, withTitle, initialFolder, onSubmit }: {
  submitLabel: string; onClose: () => void; folders: string[]; withTitle?: boolean; initialFolder: string;
  onSubmit: (title: string, folder: string) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [sel, setSel] = useState(initialFolder || NONE);
  const [fresh, setFresh] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const folder = sel === NONE ? "" : sel === NEW ? fresh.trim() : sel;
  const ok = (!withTitle || title.trim()) && (sel !== NEW || folder);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ok || pending) return;
    setPending(true);
    try {
      await onSubmit(title.trim(), folder);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했어요.");
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {withTitle && <TextField label="제목" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} autoFocus />}
      <Select
        label="폴더"
        value={sel}
        onValueChange={setSel}
        options={[{ value: NONE, label: "폴더 없음" }, ...folders.map((f) => ({ value: f, label: f })), { value: NEW, label: "새 폴더…" }]}
      />
      {sel === NEW && <TextField label="새 폴더 이름" value={fresh} onChange={(e) => setFresh(e.target.value)} maxLength={100} autoFocus />}
      {error && <p role="alert" className="gc-error m-0">{error}</p>}
      <div className="gc-actions">
        <Button variant="secondary" onClick={onClose} disabled={pending}>취소</Button>
        <Button type="submit" isLoading={pending} disabled={!ok}>{submitLabel}</Button>
      </div>
    </form>
  );
}
