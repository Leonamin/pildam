import type { Graph, GraphEdge, NodeKind } from "../../../shared/types";

export const KINDS: { value: NodeKind; label: string; fill: string; border: string }[] = [
  { value: "character", label: "인물", fill: "#FFB1B1", border: "#C9707A" },
  { value: "place", label: "장소", fill: "#FFDBB0", border: "#C99A5E" },
  { value: "faction", label: "세력", fill: "#FFCCB8", border: "#C98A6E" },
  { value: "item", label: "사물", fill: "#FFFAD3", border: "#C2B568" },
];

export const START = "__start";
export const END = "__end";

/** order 안에서 chapterId의 위치. null이면 fallback. */
export const idxOf = (order: string[], id: string | null, fallback: number) => (id === null ? fallback : order.indexOf(id));

/** "1화~7화", "8화~", "처음부터 끝까지" */
export function rangeText(order: string[], e: GraphEdge) {
  const f = e.fromChapterId === null ? 1 : idxOf(order, e.fromChapterId, 0) + 1;
  const t = e.toChapterId === null ? null : idxOf(order, e.toChapterId, 0) + 1;
  if (f === 1 && t === null) return "처음부터 끝까지";
  return `${f}화~${t === null ? "" : `${t}화`}`;
}

export const nameOf = (g: Graph, id: string) => g.nodes.find((n) => n.id === id)?.name ?? "?";

const startsAt = (order: string[], e: GraphEdge, i: number) => e.fromChapterId !== null && idxOf(order, e.fromChapterId, -1) === i;
const endsAt = (order: string[], e: GraphEdge, i: number) => e.toChapterId !== null && idxOf(order, e.toChapterId, -1) === i;

/** 이 화에서 시작하거나 끝나는 관계 id 집합 (강조용) */
export function changedAt(order: string[], edges: GraphEdge[], index: number) {
  return new Set(edges.filter((e) => startsAt(order, e, index) || endsAt(order, e, index)).map((e) => e.id));
}

/** "민지 ↔ 서준 연인 → 적" 같은 문장들. 끝 화는 포함 구간이라 전 화(index-1)에 끝난 관계도 같은 쌍이면 이어 붙인다. */
export function changeLines(g: Graph, order: string[], index: number): string[] {
  const starts = g.edges.filter((e) => startsAt(order, e, index));
  const ends = g.edges.filter((e) => endsAt(order, e, index) || endsAt(order, e, index - 1));
  const pair = (e: GraphEdge) => [e.source, e.target].sort().join("|");
  const who = (e: GraphEdge) => `${nameOf(g, e.source)} ↔ ${nameOf(g, e.target)}`;
  const used = new Set<string>();
  const lines: string[] = [];
  for (const s of starts) {
    const prev = ends.find((e) => !used.has(e.id) && e.id !== s.id && pair(e) === pair(s));
    if (prev) used.add(prev.id);
    lines.push(prev ? `${who(s)} ${prev.label} → ${s.label}` : `${who(s)} ${s.label} 시작`);
  }
  for (const e of ends) if (!used.has(e.id) && endsAt(order, e, index)) lines.push(`${who(e)} ${e.label}, 이 화까지`);
  return lines;
}
