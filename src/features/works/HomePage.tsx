import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ChevronDown, Ellipsis, Plus, User } from "lucide-react";
import type { Work, WorkSummary } from "../../../shared/types";
import { api } from "../../shared/api";
import { useApi } from "../../shared/useApi";
import { relativeTime } from "../../shared/time";
import { Alert } from "../../shared/ui/basic/alert";
import { Button, IconButton } from "../../shared/ui/basic/button";
import { Skeleton } from "../../shared/ui/basic/skeleton";
import { TextField } from "../../shared/ui/basic/text-field";
import { Dialog } from "../../shared/ui/overlays/dialog";
import { Menu } from "../../shared/ui/overlays/menu";
import { ConfirmDialog } from "../../shared/ui/composed/confirm-dialog";
import { Wordmark } from "../../shared/ui/Wordmark";
import { NewWorkFlow } from "./NewWorkFlow";
import { logout, useAuth } from "../auth/auth";

export function HomePage() {
  const { me, setMe } = useAuth();
  const { data: works, error, loading, reload, setData } = useApi((s) => api.get<WorkSummary[]>("/api/works", s), []);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<WorkSummary | null>(null);
  const [deleting, setDeleting] = useState<WorkSummary | null>(null);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 md:px-8">
          <Link to="/" className="no-underline" aria-label="필담 홈">
            <Wordmark />
          </Link>
          <Menu
            trigger={
              <Button variant="secondary" aria-label={`${me.username} 메뉴`} className="min-h-11">
                <User size={16} aria-hidden="true" /> {me.username} <ChevronDown size={14} aria-hidden="true" />
              </Button>
            }
            items={[{ label: "로그아웃", onSelect: () => void logout(setMe) }]}
          />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
        {error ? (
          <Alert
            title="작품을 불러오지 못했어요"
            tone="danger"
            action={
              <Button variant="secondary" onClick={reload} className="mt-3 min-h-11">
                다시 시도
              </Button>
            }
          >
            {error.message}
          </Alert>
        ) : loading && !works ? (
          <Grid>
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex h-36 flex-col justify-between rounded-2xl border border-line bg-surface p-5">
                <Skeleton width="60%" height={22} />
                <Skeleton width="40%" height={16} />
              </li>
            ))}
          </Grid>
        ) : works && works.length === 0 ? (
          <div className="grid place-items-center gap-6 py-24 text-center">
            <Wordmark size="lg" />
            <Button onClick={() => setCreating(true)} style={{ minHeight: 56, paddingInline: 32, fontSize: 18 }}>
              첫 작품 시작하기
            </Button>
          </div>
        ) : (
          works && (
            <>
              <div className="mb-5 flex items-center justify-between gap-3">
                <h1 className="m-0 text-xl font-semibold">내 작품</h1>
                <Button onClick={() => setCreating(true)} className="min-h-11">
                  <Plus size={18} aria-hidden="true" /> 새 작품
                </Button>
              </div>
              <Grid>
                {works.map((w) => (
                  <WorkCard key={w.id} work={w} onRename={() => setRenaming(w)} onDelete={() => setDeleting(w)} />
                ))}
              </Grid>
            </>
          )
        )}
      </main>

      <NewWorkFlow isOpen={creating} onClose={() => setCreating(false)} />
      <TitleDialog
        isOpen={!!renaming}
        onClose={() => setRenaming(null)}
        heading="이름 바꾸기"
        submitLabel="바꾸기"
        initial={renaming?.title ?? ""}
        onSubmit={async (title) => {
          if (!renaming) return;
          const w = await api.patch<Work>(`/api/works/${renaming.id}`, { title });
          setData((list) => list && list.map((x) => (x.id === w.id ? { ...x, title: w.title, updatedAt: w.updatedAt } : x)));
        }}
      />
      <ConfirmDialog
        isOpen={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="작품을 지울까요?"
        description={`「${deleting?.title ?? ""}」과 모든 화가 사라져요. 되돌릴 수 없어요.`}
        onConfirm={async () => {
          if (!deleting) return;
          await api.delete(`/api/works/${deleting.id}`);
          setData((list) => list && list.filter((x) => x.id !== deleting.id));
        }}
      />
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>;
}

function WorkCard({ work, onRename, onDelete }: { work: WorkSummary; onRename: () => void; onDelete: () => void }) {
  return (
    <li className="relative flex min-h-36 flex-col justify-between gap-3 rounded-2xl border border-line bg-surface p-5 transition-colors focus-within:border-accent hover:border-accent">
      <h2 className="m-0 pr-10 font-manuscript text-lg leading-snug font-semibold">
        <Link to={`/works/${work.id}`} className="text-ink no-underline after:absolute after:inset-0 after:rounded-2xl after:content-['']">
          {work.title}
        </Link>
      </h2>
      <p className="m-0 text-sm text-muted">
        마지막 수정 {relativeTime(work.updatedAt)} · {work.chapterCount}화
      </p>
      <div className="absolute top-2 right-2 z-[1]">
        <Menu
          trigger={
            <IconButton label={`${work.title} 메뉴`} className="min-h-11 min-w-11">
              <Ellipsis size={20} aria-hidden="true" />
            </IconButton>
          }
          items={[
            { label: "이름 바꾸기", onSelect: onRename },
            { label: "삭제", onSelect: onDelete, isDangerous: true },
          ]}
        />
      </div>
    </li>
  );
}

function TitleDialog({
  isOpen, onClose, heading, submitLabel, initial, onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  heading: string;
  submitLabel: string;
  initial: string;
  onSubmit: (title: string) => Promise<void>;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={(o) => !o && onClose()} title={heading}>
      {/* key: 열 때마다 입력값 초기화 */}
      {isOpen && <TitleForm key={initial} heading={heading} submitLabel={submitLabel} initial={initial} onClose={onClose} onSubmit={onSubmit} />}
    </Dialog>
  );
}

function TitleForm({
  initial, submitLabel, onClose, onSubmit,
}: {
  heading: string;
  initial: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || pending) return;
    setPending(true);
    setError("");
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
      <TextField label="제목" value={title} onChange={(e) => setTitle(e.target.value)} error={error} maxLength={100} autoFocus onFocus={(e) => e.target.select()} />
      <div className="gc-actions">
        <Button variant="secondary" onClick={onClose} disabled={pending}>취소</Button>
        <Button type="submit" isLoading={pending} disabled={!title.trim()}>{submitLabel}</Button>
      </div>
    </form>
  );
}

