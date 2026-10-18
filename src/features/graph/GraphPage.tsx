import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Maximize, Network, Plus, Sparkles } from "lucide-react";
import type { Graph, GraphNode, GraphSuggestion, NodeKind, NoteMeta, Work } from "../../../shared/types";
import { api, ApiRequestError } from "../../shared/api";
import { useApi } from "../../shared/useApi";
import { useMedia } from "../../shared/useMedia";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { workNav } from "../../app/workNav";
import { Alert } from "../../shared/ui/basic/alert";
import { Button } from "../../shared/ui/basic/button";
import { Skeleton } from "../../shared/ui/basic/skeleton";
import { Slider } from "../../shared/ui/basic/slider";
import { Switch } from "../../shared/ui/basic/switch";
import { TextField } from "../../shared/ui/basic/text-field";
import { ConfirmDialog } from "../../shared/ui/composed/confirm-dialog";
import { Dialog, Drawer } from "../../shared/ui/overlays/dialog";
import { Select } from "../../shared/ui/overlays/select";
import { Tabs } from "../../shared/ui/overlays/tabs";
import { useToast } from "../../shared/ui/overlays/toast";
import { applySuggestions, edgesAt, suggestionMarks } from "./suggestions";
import { GraphAiPanel } from "./GraphAiPanel";
import { GraphCanvas } from "./GraphCanvas";
import { NodeDetail, type Edit } from "./NodeDetail";
import { KINDS, changeLines, changedAt, nameOf } from "./graphUtils";

type Loaded = { work: Work; graph: Graph };

export function GraphPage() {
  const { workId = "" } = useParams();
  const { data, error, loading, reload } = useApi<Loaded>(
    async (s) => {
      const [work, graph] = await Promise.all([api.get<Work>(`/api/works/${workId}`, s), api.get<Graph>(`/api/works/${workId}/graph`, s)]);
      return { work, graph };
    },
    [workId],
  );
  const { data: notes } = useApi((s) => api.get<NoteMeta[]>(`/api/works/${workId}/notes`, s), [workId]);
  return (
    <AppShell items={workNav(workId)}>
      {error ? (
        <main className="p-6">
          <Alert title="관계도를 불러오지 못했어요" tone="danger" action={<Button variant="secondary" onClick={reload} className="mt-3 min-h-11">다시 시도</Button>}>
            {error.message}
          </Alert>
        </main>
      ) : !data || (loading && !data) ? (
        <main className="p-6"><Skeleton width="100%" height={320} /></main>
      ) : (
        // key: 충돌로 최신본을 다시 받으면 편집 상태를 새로 시작한다.
        <GraphEditor key={data.graph.updatedAt} workId={workId} work={data.work} notes={notes ?? []} initial={data.graph} onConflict={reload} />
      )}
    </AppShell>
  );
}

type Status = "saved" | "saving" | "error";
type PanelKey = "graph" | "ai";
const newId = () => crypto.randomUUID().slice(0, 8);
const STORE = "pildam.graph.panels";
function loadPanels(): Record<PanelKey, boolean> {
  try {
    return { graph: true, ai: true, ...JSON.parse(localStorage.getItem(STORE) ?? "{}") };
  } catch {
    return { graph: true, ai: true };
  }
}

function GraphEditor({ workId, work: workProp, notes, initial, onConflict }: { workId: string; work: Work; notes: NoteMeta[]; initial: Graph; onConflict: () => void }) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const wide = useMedia("(min-width: 768px)");
  const [work, setWork] = useState(workProp); // AI를 바꾸면 갱신된다
  const [panels, setPanels] = useState(loadPanels);
  const [mobilePanel, setMobilePanel] = useState<PanelKey>("graph");
  const [pending, setPending] = useState<GraphSuggestion[]>([]); // 아직 반영도 무시도 안 한 AI 제안 (그림에 강조)
  const toggle = (k: PanelKey) => {
    if (!wide) return setMobilePanel(k);
    setPanels((p) => {
      const n = { ...p, [k]: !p[k] };
      try { localStorage.setItem(STORE, JSON.stringify(n)); } catch { /* 저장 못 해도 동작 */ }
      return n;
    });
  };
  const visible = (k: PanelKey) => (wide ? panels[k] : mobilePanel === k);
  const chapters = work.chapters;
  const order = useMemo(() => chapters.map((c) => c.id), [chapters]);

  const [graph, setGraph] = useState(initial);
  const [status, setStatus] = useState<Status>("saved");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"graph" | "list" | null>(null); // null = 화면 크기에 따른 기본값
  const [index, setIndex] = useState(Math.max(0, chapters.length - 1));
  const [showAll, setShowAll] = useState(false);
  const [fitTick, setFitTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const curView = view ?? (wide ? "graph" : "list");

  // ── 저장: 800ms 디바운스, 한 번에 하나씩 ──
  const latest = useRef(initial);
  const base = useRef(initial.updatedAt);
  const timer = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  const again = useRef(false);
  const dirty = useRef(false); // 서버에 아직 못 보낸 편집이 있다
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    dirty.current = false;
    setStatus("saving");
    try {
      const r = await api.put<{ updatedAt: string }>(`/api/works/${workId}/graph`, { graph: latest.current, baseUpdatedAt: base.current });
      base.current = r.updatedAt;
      setStatus("saved");
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "conflict") {
        notify({ title: "다른 곳에서 바뀐 관계도를 다시 불러왔어요", tone: "warning" });
        again.current = false;
        onConflict();
      } else {
        dirty.current = true;
        setStatus("error");
      }
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        void flush();
      }
    }
  }, [workId, notify, onConflict]);
  const edit: Edit = useCallback(
    (fn) => {
      latest.current = fn(latest.current);
      dirty.current = true;
      setGraph(latest.current);
      setStatus("saving");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 800);
    },
    [flush],
  );
  /** 밀린 저장을 마치고(진행 중인 것까지) 기다린다. 못 마치면 던진다. */
  const settle = useCallback(async () => {
    if (dirty.current || timer.current !== undefined) await flush();
    while (busy.current) await new Promise((r) => setTimeout(r, 30));
    if (dirty.current) throw new Error("관계도를 아직 저장하지 못했어요. 저장된 뒤에 다시 반영해 주세요.");
  }, [flush]);
  /** AI 제안 반영: 내 저장을 먼저 끝내고 → 서버의 최신본에 얹어 저장 → 화면 상태를 그 결과로 맞춘다. */
  const applyAi = useCallback(
    async (list: GraphSuggestion[]) => {
      await settle();
      const g = await api.get<Graph>(`/api/works/${workId}/graph`);
      const next = applySuggestions(g, list);
      const r = await api.put<{ updatedAt: string }>(`/api/works/${workId}/graph`, { graph: next, baseUpdatedAt: g.updatedAt });
      base.current = r.updatedAt;
      latest.current = { ...next, updatedAt: r.updatedAt };
      setGraph(latest.current);
    },
    [settle, workId],
  );
  // 화면을 떠날 때 남은 변경은 바로 저장
  useEffect(() => () => { if (timer.current !== undefined) void flush(); }, [flush]);

  const node = graph.nodes.find((n) => n.id === selected) ?? null;
  const shown = useMemo(
    () => (showAll || chapters.length === 0 ? graph.edges : edgesAt(graph, order, index)),
    [graph, order, index, showAll, chapters.length],
  );
  const highlight = useMemo(() => (showAll || chapters.length === 0 ? new Set<string>() : changedAt(order, graph.edges, index)), [graph.edges, order, index, showAll, chapters.length]);
  const lines = useMemo(() => (showAll || chapters.length === 0 ? [] : changeLines(graph, order, index)), [graph, order, index, showAll, chapters.length]);
  const currentChapterId = showAll || chapters.length === 0 ? null : order[index];
  const { marks, ghosts } = useMemo(() => suggestionMarks(graph, pending), [graph, pending]);

  function addNode(name: string, kind: NodeKind) {
    const n: GraphNode = { id: newId(), name, kind, description: "" };
    edit((g) => ({ ...g, nodes: [...g.nodes, n] }));
    setSelected(n.id);
  }

  const detail = node && (
    <NodeDetail key={node.id} graph={graph} node={node} chapters={chapters} currentChapterId={currentChapterId} edit={edit} onAskDelete={() => setDeleting(true)} />
  );

  return (
    <div className="flex h-full min-h-0">
    <main className={`min-w-0 flex-1 flex-col pb-20 ${visible("graph") ? "flex" : "hidden"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 md:px-6">
        <h1 className="m-0 text-lg font-semibold">관계도</h1>
        <div className="flex items-center gap-2">
          <SaveStatus status={status} onRetry={() => void flush()} />
          {curView === "graph" && graph.nodes.length > 0 && (
            <Button variant="secondary" onClick={() => setFitTick((t) => t + 1)} className="min-h-11">
              <Maximize size={16} aria-hidden="true" /> 맞춤 보기
            </Button>
          )}
          <Button onClick={() => setAdding(true)} className="min-h-11">
            <Plus size={16} aria-hidden="true" /> 인물/장소 추가
          </Button>
        </div>
      </div>

      {graph.nodes.length === 0 ? (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="flex max-w-sm flex-col items-center gap-4">
            <p className="m-0 text-lg font-medium">아직 아무도 없어요.</p>
            <p className="m-0 text-sm text-muted">원고에서 "이 화 정리하기"를 누르면 AI가 등장인물과 관계를 채워 줘요.</p>
            <Button onClick={() => setAdding(true)} style={{ minHeight: 52, paddingInline: 28 }}>첫 인물 추가하기</Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 md:p-4">
            <div className="[&_.gc-tabs-panel]:hidden">
            <Tabs
              variant="segmented"
              label="보기 방식"
              value={curView}
              onValueChange={(v) => setView(v as "graph" | "list")}
              items={[
                { value: "list", label: "목록", content: null },
                { value: "graph", label: "그림", content: null },
              ]}
            />
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {curView === "graph" ? (
                <GraphCanvas workId={workId} nodes={graph.nodes} edges={shown} highlight={highlight} marks={marks} ghosts={ghosts} selectedId={selected} fitTick={fitTick} onSelect={setSelected} />
              ) : (
                <NodeList graph={graph} edges={shown} selected={selected} onSelect={setSelected} />
              )}
            </div>
            {chapters.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface p-3">
                <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                  <div className="min-w-48 flex-1">
                    <Slider
                      label="시점"
                      value={index + 1}
                      min={1}
                      max={chapters.length}
                      isDisabled={showAll}
                      valueText={showAll ? "전체" : `${index + 1}화 시점`}
                      onValueChange={(v) => setIndex(v - 1)}
                    />
                  </div>
                  <Switch label="전체" isChecked={showAll} onCheckedChange={setShowAll} />
                </div>
                {lines.length > 0 && (
                  <p className="m-0 mt-1 text-sm text-accent" aria-live="polite">
                    이 화에서 바뀐 관계: {lines.join(" · ")}
                  </p>
                )}
              </div>
            )}
          </div>
          {node && wide && (
            <aside aria-label={`${node.name} 상세`} className="w-80 shrink-0 overflow-auto border-l border-line bg-surface p-4">
              <h2 className="m-0 mb-3 text-lg font-semibold">{node.name || "이름 없음"}</h2>
              {detail}
            </aside>
          )}
        </div>
      )}

      {node && !wide && (
        <Drawer isOpen title={node.name || "이름 없음"} onOpenChange={(o) => !o && setSelected(null)}>
          {detail}
        </Drawer>
      )}
      <AddNodeDialog isOpen={adding} onClose={() => setAdding(false)} onAdd={addNode} />
      <ConfirmDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title="지울까요?"
        description={`「${node?.name ?? ""}」과 이어진 관계도 함께 사라져요.`}
        onConfirm={async () => {
          if (!node) return;
          edit((g) => ({ ...g, nodes: g.nodes.filter((n) => n.id !== node.id), edges: g.edges.filter((e) => e.source !== node.id && e.target !== node.id) }));
          setSelected(null);
        }}
      />
    </main>
    {!visible("graph") && !visible("ai") && (
      <main className="grid min-w-0 flex-1 place-items-center p-6">
        <Button style={{ minHeight: 64, paddingInline: 32, fontSize: 18 }} onClick={() => toggle("graph")}><Network size={22} aria-hidden="true" /> 관계도 열기</Button>
      </main>
    )}
    <aside className={`h-full min-h-0 border-l border-line bg-surface-subtle/40 ${visible("ai") ? "" : "hidden"} ${wide && panels.graph ? "w-[320px] shrink-0 xl:w-[360px]" : "min-w-0 flex-1"}`}>
      <GraphAiPanel
        work={work}
        notes={notes}
        chapterId={currentChapterId}
        onWork={setWork}
        onOpenNote={(id) => navigate(`/works/${workId}?note=${id}`)}
        apply={applyAi}
        onPending={setPending}
      />
    </aside>
    <GraphDock pressed={{ graph: visible("graph"), ai: visible("ai") }} onToggle={toggle} />
    </div>
  );
}

const DOCK: { key: PanelKey; label: string; icon: React.ReactNode }[] = [
  { key: "graph", label: "관계도", icon: <Network size={18} aria-hidden="true" /> },
  { key: "ai", label: "AI", icon: <Sparkles size={18} aria-hidden="true" /> },
];
/** 작업 화면의 PanelDock과 같은 모양 (켜고 끄는 대상만 다르다). */
function GraphDock({ pressed, onToggle }: { pressed: Record<PanelKey, boolean>; onToggle: (k: PanelKey) => void }) {
  return (
    <div role="group" aria-label="화면 전환" className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-full border border-line bg-surface p-1.5 shadow-[var(--gc-shadow)]">
      {DOCK.map((it) => (
        <button
          key={it.key}
          type="button"
          aria-pressed={pressed[it.key]}
          onClick={() => onToggle(it.key)}
          className={`flex min-h-11 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border-0 px-3 text-sm font-medium sm:px-4 ${
            pressed[it.key] ? "bg-accent text-on-accent" : "bg-transparent text-ink hover:bg-black/5"
          }`}
        >
          {it.icon} {it.label}
        </button>
      ))}
    </div>
  );
}

function SaveStatus({ status, onRetry }: { status: Status; onRetry: () => void }) {
  if (status === "error")
    return (
      <button type="button" onClick={onRetry} className="min-h-11 cursor-pointer border-0 bg-transparent px-2 text-sm text-danger underline">
        저장하지 못했어요. 다시 저장
      </button>
    );
  return <span role="status" className="text-sm text-muted">{status === "saving" ? "저장 중…" : "저장됨"}</span>;
}

function NodeList({ graph, edges, selected, onSelect }: { graph: Graph; edges: Graph["edges"]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-5">
      {KINDS.map((k) => {
        const nodes = graph.nodes.filter((n) => n.kind === k.value);
        if (nodes.length === 0) return null;
        return (
          <section key={k.value} aria-label={k.label}>
            <h2 className="m-0 mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
              <span aria-hidden="true" className="inline-block size-3 rounded-full border" style={{ background: k.fill, borderColor: k.border }} />
              {k.label}
            </h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {nodes.map((n) => {
                const rel = edges.filter((e) => e.source === n.id || e.target === n.id);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(n.id)}
                      aria-pressed={selected === n.id}
                      className={`flex min-h-14 w-full cursor-pointer flex-col items-start gap-0.5 rounded-xl border bg-surface px-4 py-2 text-left text-ink ${selected === n.id ? "border-accent" : "border-line"}`}
                    >
                      <span className="font-semibold">{n.name || "이름 없음"}</span>
                      <span className="text-sm text-muted">
                        {rel.length === 0 ? "이어진 관계 없음" : rel.map((e) => `${nameOf(graph, e.source === n.id ? e.target : e.source)} ${e.label}`).join(" · ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AddNodeDialog({ isOpen, onClose, onAdd }: { isOpen: boolean; onClose: () => void; onAdd: (name: string, kind: NodeKind) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<NodeKind>("character");
  useEffect(() => {
    if (isOpen) setName("");
  }, [isOpen]);
  return (
    <Dialog isOpen={isOpen} onOpenChange={(o) => !o && onClose()} title="인물/장소 추가">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onAdd(name.trim(), kind);
          onClose();
        }}
      >
        <TextField label="이름" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
        <Select label="종류" value={kind} onValueChange={(v) => setKind(v as NodeKind)} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
        <div className="gc-actions">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button type="submit" disabled={!name.trim()}>추가</Button>
        </div>
      </form>
    </Dialog>
  );
}
