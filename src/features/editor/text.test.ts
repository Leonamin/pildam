// node --test src/features/editor/text.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Schema } from "@tiptap/pm/model";
import { docToText, offsetToPm, pmToOffset, splitParagraphs, textToDoc } from "./text.ts";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*", group: "block" },
    text: {},
  },
});
const TEXT = "가나다\n\n라마\n\n\n\n바사아자";
const doc = schema.nodeFromJSON(textToDoc(TEXT));

test("문단 분리·직렬화", () => {
  assert.deepEqual(splitParagraphs(TEXT), ["가나다", "라마", "바사아자"]);
  assert.equal(docToText(doc), "가나다\n\n라마\n\n바사아자");
  assert.equal(docToText(schema.nodeFromJSON(textToDoc(""))), "");
});

test("PM 위치 ↔ 오프셋 왕복", () => {
  const text = docToText(doc);
  for (let off = 0; off <= text.length; off++) {
    if (text[off] === "\n" || text[off - 1] === "\n") continue; // 문단 사이 틈 제외
    assert.equal(pmToOffset(doc, offsetToPm(doc, off)), off, `offset ${off}`);
  }
  assert.equal(pmToOffset(doc, 2), 1);
  assert.equal(pmToOffset(doc, 8), 7); // 두 번째 문단 끝
});

test("선택 범위 텍스트가 오프셋과 일치", () => {
  const text = docToText(doc);
  const from = offsetToPm(doc, 1); // '나'
  const to = offsetToPm(doc, 7); // 두 번째 문단 끝
  assert.equal(doc.textBetween(from, to, "\n\n"), text.slice(pmToOffset(doc, from), pmToOffset(doc, to)));
});

test("범위 밖은 끝으로", () => {
  assert.equal(offsetToPm(doc, 999), doc.content.size - 1);
  assert.equal(pmToOffset(doc, 999), docToText(doc).length);
});
