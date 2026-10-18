// node --test src/features/editor/docDiff.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHunks, diffParagraphs } from "./docDiff.ts";

test("같으면 변경 없음", () => assert.deepEqual(diffParagraphs(["가", "나"], ["가", "나"]), []));

test("바뀐 문단은 지우고 새로 쓴다", () => {
  assert.deepEqual(diffParagraphs(["가", "나", "다"], ["가", "나2", "다"]), [{ at: 1, del: 1, add: ["나2"] }]);
});

test("끼워 넣기와 지우기", () => {
  assert.deepEqual(diffParagraphs(["가", "다"], ["가", "나", "다"]), [{ at: 1, del: 0, add: ["나"] }]);
  assert.deepEqual(diffParagraphs(["가", "나", "다"], ["가", "다"]), [{ at: 1, del: 1, add: [] }]);
  assert.deepEqual(diffParagraphs([], ["가"]), [{ at: 0, del: 0, add: ["가"] }]);
});

test("여러 곳이 바뀌어도 적용하면 새 글이 된다", () => {
  const cases: [string[], string[]][] = [
    [["a", "b", "c", "d", "e"], ["a", "x", "c", "y", "z", "e"]],
    [["a", "b"], ["c", "d", "e"]],
    [["a", "a", "b"], ["b", "a", "a"]],
    [["", "a", ""], ["a"]],
  ];
  for (const [a, b] of cases) assert.deepEqual(applyHunks(a, diffParagraphs(a, b)), b);
});
