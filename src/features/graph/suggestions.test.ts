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

test("applySuggestions: 노드 고치기·지우기, 관계 지우기", () => {
  let g = applySuggestions(empty, [
    { type: "add-edge", sourceName: "민지", targetName: "서준", label: "연인", fromChapterId: null },
    { type: "add-edge", sourceName: "민지", targetName: "지호", label: "친구", fromChapterId: null },
  ]);
  g = applySuggestions(g, [
    { type: "update-node", name: "민지", node: { name: "민지아", description: "주인공" } },
    { type: "remove-edge", sourceName: "서준", targetName: "민지아", label: "연인" },
    { type: "remove-node", name: "지호" },
  ]);
  assert.deepEqual(g.nodes.map((n) => n.name).sort(), ["민지아", "서준"]);
  assert.equal(g.nodes.find((n) => n.name === "민지아")?.description, "주인공");
  assert.equal(g.edges.length, 0);
});

test("suggestionMarks: 바꿀 노드·지울 관계·유령 관계", async () => {
  const { suggestionMarks } = await import("./suggestions.ts");
  const g = {
    nodes: [{ id: "a", name: "무겸", kind: "character", description: "" }, { id: "b", name: "이헌", kind: "character", description: "" }],
    edges: [{ id: "e1", source: "a", target: "b", label: "적", fromChapterId: null, toChapterId: null }],
    updatedAt: "",
  } as never;
  const r = suggestionMarks(g, [
    { type: "update-node", name: "무겸", node: { description: "x" } },
    { type: "remove-edge", sourceName: "이헌", targetName: "무겸", label: "적" },
    { type: "add-edge", sourceName: "무겸", targetName: "이헌", label: "동맹", fromChapterId: null },
    { type: "add-node", node: { name: "새", kind: "place", description: "" } },
  ]);
  assert.deepEqual(r.marks, { a: "change", e1: "remove", b: "change" });
  assert.equal(r.ghosts.length, 1);
});
