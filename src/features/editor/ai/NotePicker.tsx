import { Paperclip, X } from "lucide-react";
import type { NoteMeta } from "../../../../shared/types";
import { Button } from "../../../shared/ui/basic/button";
import { Popover } from "../../../shared/ui/overlays/popover";

/** "폴더 › 제목" (폴더 없으면 제목만). 서버의 usedNotes 표기와 같다. */
export const noteLabel = (n: Pick<NoteMeta, "folder" | "title">) => (n.folder ? `${n.folder} › ${n.title}` : n.title);

/** 노트를 폴더별로 묶는다(처음 나온 순서 유지, 폴더 없는 노트는 "" 묶음). */
export function groupByFolder(notes: NoteMeta[]): [string, NoteMeta[]][] {
  const m = new Map<string, NoteMeta[]>();
  for (const n of notes) m.set(n.folder, [...(m.get(n.folder) ?? []), n]);
  return [...m];
}

/**
 * 붙일 노트 고르기. 선택한 노트 id를 value/onChange로 주고받는다.
 * <NotePicker notes={NoteMeta[]} value={string[]} onChange={ids => …} disabled? />
 * 선택한 노트는 <NoteChips />로 입력창 위에 보여 준다.
 */
export function NotePicker({ notes, value, onChange, disabled }: {
  notes: NoteMeta[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <Popover
      label="노트 붙이기"
      trigger={
        <Button variant="secondary" className="min-h-9 self-start" disabled={disabled}>
          <Paperclip size={14} aria-hidden="true" /> 노트 붙이기
        </Button>
      }
    >
      <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto pr-1">
        {groupByFolder(notes).map(([folder, list]) => (
          <fieldset key={folder} className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
            <legend className="p-0 pb-1 text-xs font-semibold text-muted">{folder || "폴더 없음"}</legend>
            {list.map((n) => (
              <label key={n.id} className="gc-choice min-h-9 text-sm">
                <input type="checkbox" className="gc-checkbox-input" checked={value.includes(n.id)} onChange={() => toggle(n.id)} />
                <span className="min-w-0 truncate">{n.title}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </Popover>
  );
}

/** 선택한 노트를 지울 수 있는 칩으로 보여 준다. 고른 게 없으면 아무것도 그리지 않는다. */
export function NoteChips({ notes, value, onChange, disabled }: {
  notes: NoteMeta[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const chosen = value.flatMap((id) => notes.find((n) => n.id === id) ?? []);
  if (!chosen.length) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label="붙인 노트">
      {chosen.map((n) => (
        <li key={n.id} className="flex max-w-full items-center gap-1 rounded-full border border-line bg-surface py-0.5 pr-1 pl-3 text-xs">
          <span className="truncate">{noteLabel(n)}</span>
          <button
            type="button"
            aria-label={`${n.title} 빼기`}
            disabled={disabled}
            onClick={() => onChange(value.filter((v) => v !== n.id))}
            className="grid min-h-6 min-w-6 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted hover:bg-black/5"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
