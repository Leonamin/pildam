import { test } from "node:test";
import assert from "node:assert/strict";
import { applySuggestions, edgesAt } from "./suggestions.ts";
import type { Graph } from "../../../shared/types.ts";

const empty: Graph = { nodes: [], edges: [], updatedAt: "" };
const order = ["c1", "c2", "c3"];

test("applySuggestions: 노드·관계 추가 후 끝내기", () => {
  let g = applySuggestions(empty, [
    { type: "add-node", node: { name: "민지", kind: "character", description: "" } },
    { type: "add-edge", sourceName: "민지", targetName: "서준", label: "연인", fromChapterId: null },
  ]);
  assert.equal(g.nodes.length, 2); // 서준은 자동 생성
  g = applySuggestions(g, [{ type: "end-edge", sourceName: "서준", targetName: "민지", label: "연인", toChapterId: "c2" }]);
  assert.equal(g.edges[0].toChapterId, "c2");
});

test("edgesAt: 구간 경계 포함", () => {
  const g: Graph = {
    nodes: [],
    updatedAt: "",
    edges: [
      { id: "a", source: "x", target: "y", label: "연인", fromChapterId: null, toChapterId: "c2" },
      { id: "b", source: "x", target: "y", label: "적", fromChapterId: "c3", toChapterId: null },
    ],
  };
  assert.deepEqual(edgesAt(g, order, 1).map((e) => e.id), ["a"]);
  assert.deepEqual(edgesAt(g, order, 2).map((e) => e.id), ["b"]);
});
