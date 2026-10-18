import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ChapterMeta, Graph, GraphEdge, GraphNode, NodeKind } from "../../../shared/types";
import { Button, IconButton } from "../../shared/ui/basic/button";
import { TextArea } from "../../shared/ui/basic/text-area";
import { TextField } from "../../shared/ui/basic/text-field";
import { Select } from "../../shared/ui/overlays/select";
import { END, KINDS, START, idxOf, nameOf, rangeText } from "./graphUtils";

export type Edit = (fn: (g: Graph) => Graph) => void;

const newId = () => crypto.randomUUID().slice(0, 8);

function chapterOptions(chapters: ChapterMeta[], first: string, firstLabel: string) {
  return [{ value: first, label: firstLabel }, ...chapters.map((c, i) => ({ value: c.id, label: `${i + 1}화` }))];
}

/** 노드 하나의 설명·관계 편집. 바뀐 값은 곧바로 edit()으로 올린다(저장은 위에서 디바운스). */
export function NodeDetail({
  graph, node, chapters, currentChapterId, edit, onAskDelete,
}: {
  graph: Graph;
  node: GraphNode;
  chapters: ChapterMeta[];
  currentChapterId: string | null; // 지금 보는 화 (관계 추가 기본 시작 화)
  edit: Edit;
  onAskDelete: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const order = chapters.map((c) => c.id);
  const patchNode = (p: Partial<GraphNode>) => edit((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === node.id ? { ...n, ...p } : n)) }));

  const mine = graph.edges.filter((e) => e.source === node.id || e.target === node.id);
  const groups = new Map<string, GraphEdge[]>();
  for (const e of mine) {
    const other = e.source === node.id ? e.target : e.source;
    groups.set(other, [...(groups.get(other) ?? []), e]);
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField label="이름" value={node.name} onChange={(e) => patchNode({ name: e.target.value })} maxLength={40} />
      <Select label="종류" value={node.kind} onValueChange={(v) => patchNode({ kind: v as NodeKind })} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
      <TextArea label="설명" value={node.description} onChange={(e) => patchNode({ description: e.target.value })} placeholder="어떤 사람인지, 어떤 곳인지 적어 두세요." />

      <section aria-label="관계" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-base font-semibold">관계</h3>
          {!adding && (
            <Button variant="secondary" onClick={() => setAdding(true)} className="min-h-11">
              <Plus size={16} aria-hidden="true" /> 관계 추가
            </Button>
          )}
        </div>
        {adding && (
          <AddRelation
            graph={graph} node={node} chapters={chapters} currentChapterId={currentChapterId}
            onCancel={() => setAdding(false)}
            onAdd={(edge) => {
              edit((g) => ({ ...g, edges: [...g.edges, edge] }));
              setAdding(false);
            }}
          />
        )}
        {mine.length === 0 && !adding && <p className="m-0 text-sm text-muted">아직 이어진 관계가 없어요.</p>}
        {[...groups].map(([otherId, edges]) => (
          <div key={otherId} className="rounded-xl border border-line bg-surface-subtle/50 p-3">
            <h4 className="m-0 mb-2 text-sm font-semibold">↔ {nameOf(graph, otherId)}</h4>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {edges
                .toSorted((a, b) => idxOf(order, a.fromChapterId, -1) - idxOf(order, b.fromChapterId, -1))
                .map((e) => (
                  <li key={e.id}>
                    <RelationRow edge={e} chapters={chapters} edit={edit} />
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>

      <Button variant="danger" onClick={onAskDelete} className="min-h-11 self-start">
        <Trash2 size={16} aria-hidden="true" /> 삭제
      </Button>
    </div>
  );
}

function RelationRow({ edge, chapters, edit }: { edge: GraphEdge; chapters: ChapterMeta[]; edit: Edit }) {
  const order = chapters.map((c) => c.id);
  const patch = (p: Partial<GraphEdge>) => edit((g) => ({ ...g, edges: g.edges.map((e) => (e.id === edge.id ? { ...e, ...p } : e)) }));
  const setFrom = (v: string) => {
    const from = v === START ? null : v;
    // 끝이 시작보다 앞서면 끝도 같이 옮긴다.
    const clash = from !== null && edge.toChapterId !== null && order.indexOf(edge.toChapterId) < order.indexOf(from);
    patch({ fromChapterId: from, ...(clash ? { toChapterId: from } : {}) });
  };
  const setTo = (v: string) => {
    const to = v === END ? null : v;
    const clash = to !== null && edge.fromChapterId !== null && order.indexOf(to) < order.indexOf(edge.fromChapterId);
    patch({ toChapterId: to, ...(clash ? { fromChapterId: to } : {}) });
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <TextField label="관계" value={edge.label} onChange={(e) => patch({ label: e.target.value })} maxLength={20} />
        </div>
        <IconButton label={`${edge.label || "이"} 관계 지우기`} onClick={() => edit((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== edge.id) }))}>
          <Trash2 size={18} aria-hidden="true" />
        </IconButton>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select label="시작 화" value={edge.fromChapterId ?? START} onValueChange={setFrom} options={chapterOptions(chapters, START, "처음부터")} />
        <Select label="끝 화" value={edge.toChapterId ?? END} onValueChange={setTo} options={chapterOptions(chapters, END, "끝까지")} />
      </div>
      <p className="m-0 text-xs text-muted">
        {edge.label || "관계"} · {rangeText(order, edge)}
      </p>
    </div>
  );
}

function AddRelation({
  graph, node, chapters, currentChapterId, onAdd, onCancel,
}: {
  graph: Graph;
  node: GraphNode;
  chapters: ChapterMeta[];
  currentChapterId: string | null;
  onAdd: (e: GraphEdge) => void;
  onCancel: () => void;
}) {
  const others = graph.nodes.filter((n) => n.id !== node.id);
  const [other, setOther] = useState(others[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState(currentChapterId ?? START);
  if (others.length === 0) {
    return (
      <div className="rounded-xl border border-line p-3 text-sm">
        <p className="m-0 mb-2">관계를 이으려면 다른 인물이나 장소가 먼저 있어야 해요.</p>
        <Button variant="secondary" onClick={onCancel}>알겠어요</Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-accent bg-surface p-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!label.trim() || !other) return;
        onAdd({ id: newId(), source: node.id, target: other, label: label.trim(), fromChapterId: from === START ? null : from, toChapterId: null });
      }}
    >
      <Select label="누구와" value={other} onValueChange={setOther} options={others.map((n) => ({ value: n.id, label: n.name }))} />
      <TextField label="어떤 관계인가요?" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="연인, 친구, 적…" maxLength={20} autoFocus />
      <Select label="시작 화" value={from} onValueChange={setFrom} options={chapterOptions(chapters, START, "처음부터")} />
      <div className="gc-actions">
        <Button variant="secondary" onClick={onCancel}>취소</Button>
        <Button type="submit" disabled={!label.trim()}>추가</Button>
      </div>
    </form>
  );
}
