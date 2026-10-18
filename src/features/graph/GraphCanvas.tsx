import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { GraphEdge, GraphNode } from "../../../shared/types";
import { KINDS } from "./graphUtils";
import type { Ghost, Mark } from "./suggestions";

type Pos = Record<string, { x: number; y: number }>;
const posKey = (workId: string) => `pildam:graph-pos:${workId}`;
function loadPos(workId: string): Pos {
  try {
    return JSON.parse(localStorage.getItem(posKey(workId)) ?? "{}");
  } catch {
    return {};
  }
}
function savePos(workId: string, cy: cytoscape.Core) {
  try {
    const p: Pos = { ...loadPos(workId) };
    cy.nodes().forEach((n) => { p[n.id()] = n.position(); });
    localStorage.setItem(posKey(workId), JSON.stringify(p));
  } catch {
    /* 저장 못 해도 괜찮다 */
  }
}

// 노드가 하나뿐이면 fit이 최대 배율까지 키워 버리므로 적당한 크기에서 멈춘다.
const fit = (cy: cytoscape.Core) => {
  cy.fit(undefined, 40);
  if (cy.zoom() > 1.2) {
    cy.zoom(1.2);
    cy.center();
  }
};

// 새 노드 자리: 기존 노드들의 중심 둘레에서 겹치지 않는 첫 곳 (cose는 잠긴 노드 위에 겹쳐 놓는다).
type XY = { x: number; y: number };
function spot(taken: XY[]): XY {
  const c = { x: taken.reduce((a, p) => a + p.x, 0) / taken.length, y: taken.reduce((a, p) => a + p.y, 0) / taken.length };
  for (let r = 1; ; r++) {
    for (let a = 0; a < 8 * r; a++) {
      const t = (a / (8 * r)) * 2 * Math.PI;
      const p = { x: c.x + Math.cos(t) * r * 180, y: c.y + Math.sin(t) * r * 100 };
      if (taken.every((q) => Math.abs(q.x - p.x) > 170 || Math.abs(q.y - p.y) > 70)) return p;
    }
  }
}

const FONT = "Pretendard, system-ui, sans-serif";

export function GraphCanvas({
  workId, nodes, edges, highlight, marks, ghosts, selectedId, fitTick, onSelect,
}: {
  workId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlight: Set<string>;
  marks: Record<string, Mark>; // AI 제안이 닿는 노드·관계 (반영 전)
  ghosts: Ghost[]; // 제안된 새 관계 (점선)
  selectedId: string | null;
  fitTick: number;
  onSelect: (id: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const didFit = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // 인스턴스는 한 번만 만든다.
  useEffect(() => {
    const cy = cytoscape({
      container: box.current,
      minZoom: 0.3,
      maxZoom: 2.5,
      style: [
        {
          selector: "node",
          style: {
            label: "data(name)", "font-family": FONT, "font-size": 15, "font-weight": 600, color: "#3a2f2c",
            "text-valign": "center", "text-halign": "center", shape: "round-rectangle",
            width: "data(w)", height: 40, "border-width": 2,
            "background-color": "#FFB1B1", "border-color": "#C9707A",
          },
        },
        ...KINDS.map((k) => ({
          selector: `node[kind = "${k.value}"]`,
          style: { "background-color": k.fill, "border-color": k.border },
        })),
        { selector: "node:selected", style: { "border-width": 4, "border-color": "#b4424f" } },
        {
          selector: "edge",
          style: {
            label: "data(label)", "font-family": FONT, "font-size": 13, color: "#3a2f2c",
            "curve-style": "bezier", "control-point-step-size": 50, width: 2, "line-color": "#9a8575",
            "text-background-color": "#fffdf0", "text-background-opacity": 0.95, "text-background-padding": "3px",
            "text-background-shape": "roundrectangle",
          },
        },
        { selector: "node.mk-change", style: { "border-width": 5, "border-color": "#245bd8", "overlay-color": "#245bd8", "overlay-opacity": 0.12, "overlay-padding": 6 } },
        { selector: "node.mk-remove", style: { "border-width": 4, "border-color": "#b52a36", "border-style": "dashed", opacity: 0.65 } },
        { selector: "edge.mk-change", style: { width: 5, "line-color": "#245bd8", color: "#245bd8", "font-weight": 700 } },
        { selector: "edge.mk-remove", style: { width: 4, "line-color": "#b52a36", "line-style": "dashed", color: "#b52a36", "font-weight": 700 } },
        { selector: "edge.ghost", style: { width: 3, "line-color": "#245bd8", "line-style": "dashed", color: "#245bd8", opacity: 0.8 } },
        { selector: "edge.hl", style: { width: 5, "line-color": "#b4424f", color: "#963543", "font-weight": 700 } },
      ],
    });
    cy.on("tap", "node", (e) => onSelectRef.current(e.target.id()));
    cy.on("tap", (e) => e.target === cy && onSelectRef.current(null));
    cy.on("dragfree", "node", () => savePos(workId, cy));
    const ro = new ResizeObserver(() => cy.resize());
    ro.observe(box.current!);
    cyRef.current = cy;
    didFit.current = false;
    return () => {
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, [workId]);

  // 데이터가 바뀌면 요소를 다시 채운다. 위치는 기억해 둔 값을 쓰고, 새 노드만 cose로 놓는다.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const known: Pos = { ...loadPos(workId) };
    cy.nodes().forEach((n) => { known[n.id()] = n.position(); });
    const ids = new Set(nodes.map((n) => n.id));
    cy.elements().remove();
    const fresh: string[] = [];
    cy.add([
      ...nodes.map((n) => {
        if (!known[n.id]) fresh.push(n.id);
        return { group: "nodes" as const, data: { id: n.id, name: n.name || " ", kind: n.kind, w: Math.max(64, [...n.name].length * 16 + 32) }, position: known[n.id], classes: marks[n.id] ? `mk-${marks[n.id]}` : "" };
      }),
      ...edges
        .filter((e) => ids.has(e.source) && ids.has(e.target))
        .map((e) => ({ group: "edges" as const, data: { id: e.id, source: e.source, target: e.target, label: e.label }, classes: [highlight.has(e.id) && "hl", marks[e.id] && `mk-${marks[e.id]}`].filter(Boolean).join(" ") })),
      ...ghosts
        .filter((g) => ids.has(g.source) && ids.has(g.target))
        .map((g) => ({ group: "edges" as const, data: { id: g.id, source: g.source, target: g.target, label: g.label }, classes: "ghost" })),
    ]);
    if (fresh.length > 0) {
      if (fresh.length === nodes.length) {
        cy.layout({ name: "cose", animate: false, fit: false, padding: 40, nodeRepulsion: () => 9000, idealEdgeLength: () => 100 } as cytoscape.LayoutOptions)
          .one("layoutstop", () => {
            fit(cy);
            savePos(workId, cy);
          })
          .run();
      } else {
        const taken = nodes.filter((n) => known[n.id]).map((n) => known[n.id]);
        for (const id of fresh) {
          const p = spot(taken);
          taken.push(p);
          cy.getElementById(id).position(p);
        }
        savePos(workId, cy);
      }
    }
    if (fresh.length === 0 && !didFit.current && nodes.length > 0) fit(cy);
    if (nodes.length > 0) didFit.current = true;
    if (selectedId) cy.getElementById(selectedId).select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, highlight, marks, ghosts, workId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (selectedId) cy.getElementById(selectedId).select();
  }, [selectedId, nodes]);

  useEffect(() => {
    if (fitTick > 0 && cyRef.current) fit(cyRef.current);
  }, [fitTick]);

  return (
    <div
      ref={box}
      role="img"
      aria-label="관계도 그림. 키보드로는 '목록' 탭에서 볼 수 있어요."
      className="h-full min-h-64 w-full rounded-2xl border border-line bg-surface-subtle/40"
    />
  );
}
