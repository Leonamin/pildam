import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { FileText, Sparkles } from "lucide-react";
import type { AiTarget, ChapterMeta, NoteMeta, Work } from "../../../shared/types";
import { api } from "../../shared/api";
import { useApi } from "../../shared/useApi";
import { Alert } from "../../shared/ui/basic/alert";
import { Button } from "../../shared/ui/basic/button";
import { Skeleton } from "../../shared/ui/basic/skeleton";
import { Drawer } from "../../shared/ui/overlays/dialog";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { workNav } from "../../app/workNav";
import { AiPanel } from "./AiPanel";
import { Manuscript, targetKeyOf, type EditorBridge, type Target } from "./Manuscript";
import { Outline } from "./Outline";
import { PanelDock, type PanelKey } from "./PanelDock";
import { useMedia } from "../../shared/useMedia";
import { SelectionRewrite } from "./SelectionRewrite";
import { useToast } from "../../shared/ui/overlays/toast";

const STORE = "pildam.panels";
const DEFAULTS: Record<PanelKey, boolean> = { outline: true, manuscript: true, ai: true };
function loadPanels(): Record<PanelKey, boolean> {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}
// 예전 ?doc=world|notes 주소는 같은 이름의 폴더에 있는 첫 노트로 보낸다.
const LEGACY_FOLDER: Record<string, string> = { world: "세계관", notes: "메모" };

export function WorkspacePage() {
  const { workId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: work, error, reload, setData: setWork } = useApi((s) => api.get<Work>(`/api/works/${workId}`, s), [workId]);
  const { data: notes, setData: setNotes } = useApi((s) => api.get<NoteMeta[]>(`/api/works/${workId}/notes`, s), [workId]);
  const { notify } = useToast();
  const [version, setVersion] = useState(0); // 나누기처럼 서버가 본문을 바꾼 뒤 에디터를 다시 열 때 올린다
  const [panels, setPanels] = useState(loadPanels);
  const [mobilePanel, setMobilePanel] = useState<PanelKey>("manuscript");
  const [bridge, setBridge] = useState<EditorBridge | null>(null);
  const [drawer, setDrawer] = useState(false); // 태블릿: 목차는 덮는 서랍
  const [aiBusy, setAiBusy] = useState(false);
  const [askFor, setAskFor] = useState<string | null>(null);
  const mobile = useMedia("(max-width: 767px)");
  const desktop = useMedia("(min-width: 1024px)");

  const docParam = params.get("doc");
  const isStyle = docParam === "style";
  const noteParam = params.get("note");
  const legacy = docParam && docParam !== "style" ? docParam : null;
  const note = noteParam ? notes?.find((n) => n.id === noteParam) ?? null : null;
  useEffect(() => {
    if (!legacy || !notes) return;
    const hit = notes.find((n) => n.folder === LEGACY_FOLDER[legacy]) ?? notes[0];
    setParams(hit ? { note: hit.id } : {}, { replace: true });
  }, [legacy, notes, setParams]);
  const waitingNotes = (!!noteParam || !!legacy) && !notes;
  const chIndex = work ? Math.max(0, work.chapters.findIndex((c) => c.id === params.get("ch"))) : -1;
  const chapter: ChapterMeta | null = work?.chapters[chIndex] ?? null;
  const previous = chIndex > 0 ? work!.chapters[chIndex - 1] : null;

  const toggle = (k: PanelKey) => {
    if (mobile) return setMobilePanel(k);
    if (k === "outline" && !desktop) return setDrawer((d) => !d);
    setPanels((p) => {
      const n = { ...p, [k]: !p[k] };
      try { localStorage.setItem(STORE, JSON.stringify(n)); } catch { /* 저장 못 해도 동작 */ }
      return n;
    });
  };
  const open = (k: PanelKey) => !panels[k] && toggle(k);
  const visible = (k: PanelKey) => (mobile ? mobilePanel === k : k === "outline" && !desktop ? drawer : panels[k]);
  const showCenter = (k: "manuscript") => visible(k);

  const selectChapter = (id: string) => {
    setParams({ ch: id });
    if (mobile) setMobilePanel("manuscript");
    else if (!desktop) setDrawer(false);
    open("manuscript");
  };
  const selectDoc = (p: Record<string, string>) => {
    setParams(p);
    if (mobile) setMobilePanel("manuscript");
    else if (!desktop) setDrawer(false);
    open("manuscript");
  };
  const onReady = useCallback((b: EditorBridge | null) => setBridge(b), []);

  async function addChapter() {
    if (!work) return;
    const prev = work.chapters.at(-1);
    const c = await api.post<ChapterMeta>(`/api/works/${work.id}/chapters`, { title: "제목 없음" });
    setWork(await api.get<Work>(`/api/works/${work.id}`));
    setParams({ ch: c.id });
    if (prev && !prev.hasSummary) setAskFor(c.id);
    if (mobile) setMobilePanel("manuscript");
  }
  async function splitNote(id: string) {
    if (bridge?.key === `note:${id}`) await bridge.save(); // 안 저장된 글이 나누기 결과를 덮지 않게
    setNotes(await api.post<NoteMeta[]>(`/api/works/${workId}/notes/${id}/split`));
    setVersion((v) => v + 1);
    notify({ title: "제목별로 나눴어요", tone: "success" });
  }
  async function renameChapter(title: string) {
    if (!work || !chapter) return;
    await api.patch(`/api/works/${work.id}/chapters/${chapter.id}`, { title });
    setWork(await api.get<Work>(`/api/works/${work.id}`));
  }

  if (error)
    return (
      <AppShell items={workNav(workId)}>
        <main className="p-6">
          <Alert title="작품을 불러오지 못했어요" tone="danger" action={<Button variant="secondary" onClick={reload} className="mt-3 min-h-11">다시 시도</Button>}>{error.message}</Alert>
        </main>
      </AppShell>
    );

  const target: Target | null = isStyle
    ? { kind: "doc", name: "style" }
    : note
      ? {
          kind: "note", id: note.id, title: note.title,
          // 폴더에 혼자 있는 노트만 나누기를 권한다
          onSplit: notes!.filter((n) => n.folder === note.folder).length === 1 ? () => splitNote(note.id).catch((e) => { notify({ title: e instanceof Error ? e.message : "나누지 못했어요.", tone: "error" }); }) : undefined,
        }
      : chapter && !legacy
        ? { kind: "chapter", id: chapter.id, title: chapter.title }
        : null;
  const key = target ? targetKeyOf(target) : "";
  const aiTarget: Exclude<AiTarget, { type: "graph" }> | null = !target ? null : target.kind === "chapter" ? { type: "chapter", chapterId: target.id } : target.kind === "note" ? { type: "note", noteId: target.id } : { type: "style" };
  const outline = work && (
    <Outline
      work={work}
      notes={notes ?? []}
      activeKey={key}
      onWork={setWork}
      onNotes={setNotes}
      onSelectChapter={selectChapter}
      onSelectStyle={() => selectDoc({ doc: "style" })}
      onSelectNote={(id) => selectDoc({ note: id })}
      onAdd={addChapter}
      onDeleted={(id) => chapter?.id === id && setParams({}, { replace: true })}
      onNoteDeleted={(id) => note?.id === id && setParams({}, { replace: true })}
      onSplit={splitNote}
    />
  );
  const inlineOutline = desktop || mobile;
  // 화면이 바뀌는 사이 이미 닫힌 에디터를 쓰면 화면 전체가 멈추므로, 지금 화의 에디터일 때만 쓴다.
  const live = target && bridge?.key === key ? bridge : null;
  const bothOff = !mobile && !panels.manuscript && !panels.ai;

  return (
    <AppShell items={workNav(workId)}>
      <div className="flex h-full min-h-0">
        {visible("outline") && inlineOutline && (
          <aside className={`h-full min-h-0 bg-surface ${mobile ? "w-full" : "w-60 shrink-0 border-r border-line"}`}>
            {outline ?? <div className="p-4"><Skeleton height={24} /></div>}
          </aside>
        )}
        {!desktop && !mobile && (
          <Drawer isOpen={drawer} onOpenChange={setDrawer} title="목차">
            {outline}
          </Drawer>
        )}

        <main className={`min-h-0 min-w-0 flex-1 overflow-y-auto pb-28 ${showCenter("manuscript") ? "" : "hidden"}`}>
          {!work || waitingNotes ? null : target ? (
            <Manuscript key={`${key}:${version}`} workId={workId} target={target} onTitle={renameChapter} onReady={onReady} />
          ) : (
            <div className="grid place-items-center gap-4 py-24 text-center">
              <p className="m-0 text-muted">아직 화가 없어요.</p>
              <Button className="min-h-12" onClick={() => void addChapter()}>첫 화 만들기</Button>
            </div>
          )}
        </main>

        {bothOff && (
          <main className="grid min-w-0 flex-1 place-items-center p-6">
            <div className="flex flex-wrap justify-center gap-4">
              <Button style={{ minHeight: 64, paddingInline: 32, fontSize: 18 }} onClick={() => open("manuscript")}><FileText size={22} aria-hidden="true" /> 원고 열기</Button>
              <Button variant="secondary" style={{ minHeight: 64, paddingInline: 32, fontSize: 18 }} onClick={() => open("ai")}><Sparkles size={22} aria-hidden="true" /> AI 열기</Button>
            </div>
          </main>
        )}

        <aside className={`h-full min-h-0 border-l border-line bg-surface-subtle/40 ${visible("ai") ? "" : "hidden"} ${panels.manuscript && !mobile ? "w-[320px] shrink-0 xl:w-[360px]" : "min-w-0 flex-1"}`}>
          {work && (
            <AiPanel
              work={work}
              notes={notes ?? []}
              target={aiTarget}
              previous={target?.kind === "chapter" ? previous : null}
              bridge={live}
              onWork={setWork}
              onBusy={setAiBusy}
              askSummary={target?.kind === "chapter" && !!chapter && askFor === chapter.id && !!previous && !previous.hasSummary}
              onAskDone={() => setAskFor(null)}
              onOpenNote={(id) => selectDoc({ note: id })}
              onShowManuscript={() => { if (mobile) setMobilePanel("manuscript"); else open("manuscript"); }}
            />
          )}
        </aside>
      </div>

      {live && work && aiTarget && visible("manuscript") && (
        <SelectionRewrite key={key} editor={live.editor} workId={work.id} target={aiTarget} modelId={work.modelId} disabled={aiBusy} save={live.save} />
      )}
      <PanelDock pressed={{ outline: visible("outline"), manuscript: visible("manuscript"), ai: visible("ai") }} onToggle={toggle} />
    </AppShell>
  );
}
