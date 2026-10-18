import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { GraphEdge, GraphNode } from "../../../shared/types";
import { KINDS } from "./graphUtils";

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

const FONT = "Pretendard, system-ui, sans-serif";

export function GraphCanvas({
  workId, nodes, edges, highlight, selectedId, fitTick, onSelect,
}: {
  workId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlight: Set<string>;
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
        return { group: "nodes" as const, data: { id: n.id, name: n.name || " ", kind: n.kind, w: Math.max(64, [...n.name].length * 16 + 32) }, position: known[n.id] };
      }),
      ...edges
        .filter((e) => ids.has(e.source) && ids.has(e.target))
        .map((e) => ({ group: "edges" as const, data: { id: e.id, source: e.source, target: e.target, label: e.label }, classes: highlight.has(e.id) ? "hl" : "" })),
    ]);
    if (fresh.length > 0) {
      const first = fresh.length === nodes.length;
      cy.nodes().filter((n) => !fresh.includes(n.id())).lock();
      cy.layout({ name: "cose", animate: false, fit: first, padding: 40, nodeRepulsion: () => 9000, idealEdgeLength: () => 100 } as cytoscape.LayoutOptions)
        .one("layoutstop", () => {
          cy.nodes().unlock();
          savePos(workId, cy);
        })
        .run();
    }
    if (fresh.length === 0 && !didFit.current && nodes.length > 0) cy.fit(undefined, 40);
    if (nodes.length > 0) didFit.current = true;
    if (selectedId) cy.getElementById(selectedId).select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, highlight, workId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (selectedId) cy.getElementById(selectedId).select();
  }, [selectedId, nodes]);

  useEffect(() => {
    if (fitTick > 0) cyRef.current?.fit(undefined, 40);
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
