import type { ChapterMeta, Graph, GraphEdge, GraphSuggestion } from "../../../shared/types";

const newId = () => crypto.randomUUID().slice(0, 8);

/** AI 제안을 관계도에 반영한 새 Graph를 돌려준다. 이름으로 노드를 찾고, 없으면 인물로 만든다. */
export function applySuggestions(graph: Graph, suggestions: GraphSuggestion[]): Graph {
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];
  const nodeId = (name: string) => {
    const found = nodes.find((n) => n.name === name);
    if (found) return found.id;
    const node = { id: newId(), name, kind: "character" as const, description: "" };
    nodes.push(node);
    return node.id;
  };

  const findNode = (name: string) => nodes.findIndex((n) => n.name === name);
  const samePair = (e: GraphEdge, a: string, b: string) =>
    (e.source === a && e.target === b) || (e.source === b && e.target === a);

  for (const s of suggestions) {
    if (s.type === "add-node") {
      if (findNode(s.node.name) < 0) nodes.push({ id: newId(), ...s.node });
    } else if (s.type === "update-node") {
      const i = findNode(s.name);
      if (i >= 0) nodes[i] = { ...nodes[i], ...s.node };
    } else if (s.type === "remove-node") {
      const i = findNode(s.name);
      if (i >= 0) {
        const id = nodes[i].id;
        nodes.splice(i, 1);
        for (let j = edges.length - 1; j >= 0; j--) if (edges[j].source === id || edges[j].target === id) edges.splice(j, 1);
      }
    } else if (s.type === "add-edge") {
      edges.push({
        id: newId(),
        source: nodeId(s.sourceName),
        target: nodeId(s.targetName),
        label: s.label,
        fromChapterId: s.fromChapterId,
        toChapterId: null,
      });
    } else if (s.type === "end-edge") {
      const a = nodeId(s.sourceName), b = nodeId(s.targetName);
      const i = edges.findIndex((e) => e.label === s.label && e.toChapterId === null && samePair(e, a, b));
      if (i >= 0) edges[i] = { ...edges[i], toChapterId: s.toChapterId };
    } else {
      const a = nodes[findNode(s.sourceName)]?.id, b = nodes[findNode(s.targetName)]?.id;
      const i = edges.findIndex((e) => e.label === s.label && samePair(e, a, b));
      if (i >= 0) edges.splice(i, 1);
    }
  }
  return { ...graph, nodes, edges };
}

/** 해당 화 시점(index)에 유효한 관계만. order는 work.chapters의 id 순서. */
export function edgesAt(graph: Graph, order: string[], chapterIndex: number) {
  const idx = (id: string | null, fallback: number) => (id === null ? fallback : order.indexOf(id));
  return graph.edges.filter(
    (e) => idx(e.fromChapterId, 0) <= chapterIndex && chapterIndex <= idx(e.toChapterId, Infinity),
  );
}

const KIND = { character: "인물", place: "장소", faction: "세력", item: "사물" } as const;

/** 제안 카드에 보일 한 줄 제목·설명. chapters가 있으면 화 ID를 "N화"로 바꿔 보여 준다. */
export function describeSuggestion(s: GraphSuggestion, chapters: ChapterMeta[] = []): { head: string; body: string } {
  const at = (id: string | null) => {
    const i = chapters.findIndex((c) => c.id === id);
    return i >= 0 ? `${i + 1}화` : "";
  };
  switch (s.type) {
    case "add-node": return { head: `새 ${KIND[s.node.kind]} · ${s.node.name}`, body: s.node.description };
    case "update-node": return {
      head: `${s.name} 고치기`,
      body: [s.node.name && `이름 → ${s.node.name}`, s.node.kind && `종류 → ${KIND[s.node.kind]}`, s.node.description]
        .filter(Boolean).join(" · "),
    };
    case "remove-node": return { head: `${s.name} 지우기`, body: "연결된 관계도 함께 지워요" };
    case "add-edge": return { head: `${s.sourceName} ↔ ${s.targetName}`, body: `${s.label}${at(s.fromChapterId) && ` · ${at(s.fromChapterId)}부터`}` };
    case "end-edge": return { head: `${s.sourceName} ↔ ${s.targetName}`, body: `${s.label} 끝${at(s.toChapterId) && ` · ${at(s.toChapterId)}까지`}` };
    case "remove-edge": return { head: `${s.sourceName} ↔ ${s.targetName}`, body: `${s.label} 관계 지우기` };
  }
}

export type Mark = "change" | "remove";
export type Ghost = { id: string; source: string; target: string; label: string };

/** 아직 반영하지 않은 제안이 닿는 노드·관계 id (그림 위 강조용). add-edge는 점선 유령 관계로, add-node는 보여 주지 않는다. */
export function suggestionMarks(graph: Graph, suggestions: GraphSuggestion[]): { marks: Record<string, Mark>; ghosts: Ghost[] } {
  const marks: Record<string, Mark> = {};
  const ghosts: Ghost[] = [];
  const id = (name: string) => graph.nodes.find((n) => n.name === name)?.id;
  const between = (a?: string, b?: string, label?: string) =>
    graph.edges.filter((e) => a && b && (label === undefined || e.label === label) && ((e.source === a && e.target === b) || (e.source === b && e.target === a)));
  suggestions.forEach((s, i) => {
    if (s.type === "update-node") {
      const n = id(s.name);
      if (n) marks[n] ??= "change";
    } else if (s.type === "remove-node") {
      const n = id(s.name);
      if (!n) return;
      marks[n] = "remove";
      for (const e of graph.edges) if (e.source === n || e.target === n) marks[e.id] = "remove";
    } else if (s.type === "add-edge") {
      const a = id(s.sourceName), b = id(s.targetName);
      for (const n of [a, b]) if (n) marks[n] ??= "change";
      if (a && b) ghosts.push({ id: `ghost-${i}`, source: a, target: b, label: s.label });
    } else if (s.type === "end-edge") {
      for (const e of between(id(s.sourceName), id(s.targetName), s.label)) marks[e.id] ??= "change";
    } else if (s.type === "remove-edge") {
      for (const e of between(id(s.sourceName), id(s.targetName), s.label)) marks[e.id] = "remove";
    }
  });
  return { marks, ghosts };
}
