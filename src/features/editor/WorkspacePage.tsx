import { useCallback, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { FileText, Sparkles } from "lucide-react";
import type { ChapterMeta, DocName, Work } from "../../../shared/types";
import { api } from "../../shared/api";
import { useApi } from "../../shared/useApi";
import { Alert } from "../../shared/ui/basic/alert";
import { Button } from "../../shared/ui/basic/button";
import { Skeleton } from "../../shared/ui/basic/skeleton";
import { Drawer } from "../../shared/ui/overlays/dialog";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { workNav } from "../../app/workNav";
import { AiPanel } from "./AiPanel";
import { Manuscript, type EditorBridge, type Target } from "./Manuscript";
import { Outline } from "./Outline";
import { PanelDock, type PanelKey } from "./PanelDock";
import { useMedia } from "../../shared/useMedia";
import { SelectionRewrite } from "./SelectionRewrite";

const STORE = "pildam.panels";
const DEFAULTS: Record<PanelKey, boolean> = { outline: true, manuscript: true, ai: true };
function loadPanels(): Record<PanelKey, boolean> {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}
const isDoc = (v: string | null): v is DocName => v === "world" || v === "style" || v === "notes";

export function WorkspacePage() {
  const { workId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: work, error, reload, setData: setWork } = useApi((s) => api.get<Work>(`/api/works/${workId}`, s), [workId]);
  const [panels, setPanels] = useState(loadPanels);
  const [mobilePanel, setMobilePanel] = useState<PanelKey>("manuscript");
  const [bridge, setBridge] = useState<EditorBridge | null>(null);
  const [drawer, setDrawer] = useState(false); // 태블릿: 목차는 덮는 서랍
  const [aiBusy, setAiBusy] = useState(false);
  const [askFor, setAskFor] = useState<string | null>(null);
  const mobile = useMedia("(max-width: 767px)");
  const desktop = useMedia("(min-width: 1024px)");

  const docParam = params.get("doc");
  const docName = isDoc(docParam) ? docParam : null;
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
  const selectDoc = (name: DocName) => {
    setParams({ doc: name });
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

  const target: Target | null = docName ? { kind: "doc", name: docName } : chapter ? { kind: "chapter", id: chapter.id, title: chapter.title } : null;
  const outline = work && (
    <Outline
      work={work}
      chapterId={chapter?.id ?? null}
      docName={docName}
      onWork={setWork}
      onSelectChapter={selectChapter}
      onSelectDoc={selectDoc}
      onAdd={addChapter}
      onDeleted={(id) => chapter?.id === id && setParams({}, { replace: true })}
    />
  );
  const inlineOutline = desktop || mobile;
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
          {!work ? null : target ? (
            <Manuscript key={target.kind === "doc" ? target.name : target.id} workId={workId} target={target} onTitle={renameChapter} onReady={onReady} />
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
              chapter={docName ? null : chapter}
              previous={previous}
              bridge={docName ? null : bridge}
              onWork={setWork}
              onBusy={setAiBusy}
              askSummary={!!chapter && askFor === chapter.id && !!previous && !previous.hasSummary}
              onAskDone={() => setAskFor(null)}
            />
          )}
        </aside>
      </div>

      {bridge && work && chapter && !docName && visible("manuscript") && (
        <SelectionRewrite key={chapter.id} editor={bridge.editor} workId={work.id} chapterId={chapter.id} modelId={work.modelId} disabled={aiBusy} save={bridge.save} />
      )}
      <PanelDock pressed={{ outline: visible("outline"), manuscript: visible("manuscript"), ai: visible("ai") }} onToggle={toggle} />
    </AppShell>
  );
}
