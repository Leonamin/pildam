import type { Graph, GraphSuggestion } from "../../../shared/types";

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

  for (const s of suggestions) {
    if (s.type === "add-node") {
      if (!nodes.some((n) => n.name === s.node.name)) nodes.push({ id: newId(), ...s.node });
    } else if (s.type === "add-edge") {
      edges.push({
        id: newId(),
        source: nodeId(s.sourceName),
        target: nodeId(s.targetName),
        label: s.label,
        fromChapterId: s.fromChapterId,
        toChapterId: null,
      });
    } else {
      const source = nodeId(s.sourceName);
      const target = nodeId(s.targetName);
      const i = edges.findIndex(
        (e) => e.label === s.label && e.toChapterId === null &&
          ((e.source === source && e.target === target) || (e.source === target && e.target === source)),
      );
      if (i >= 0) edges[i] = { ...edges[i], toChapterId: s.toChapterId };
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
