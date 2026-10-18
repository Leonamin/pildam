import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson } from "./json.ts";

const obj = (t: string) => extractJson(t, "{");

test("plain, fenced, prose around", () => {
  assert.deepEqual(obj('{"a":1}'), { a: 1 });
  assert.deepEqual(obj('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(obj('네, 알겠습니다.\n{"a":1}\n이렇게 하면 됩니다. {끝}'), { a: 1 });
});
test("braces and quotes inside strings", () => {
  assert.deepEqual(obj('{"reply":"}{ 이런 {중괄호} 도 \\"있어요\\"","n":[1,{"b":"]"}]}'), { reply: '}{ 이런 {중괄호} 도 "있어요"', n: [1, { b: "]" }] });
});
test("prose with braces before the real JSON", () => {
  assert.deepEqual(obj('설명 {이건 JSON이 아님} 그리고\n{"a":[1,2]}'), { a: [1, 2] });
});
test("trailing commas", () => {
  assert.deepEqual(obj('{"a":[1,2,],"b":{"c":1,},}'), { a: [1, 2], b: { c: 1 } });
});
test("smart quotes as delimiters, raw newline in string", () => {
  assert.deepEqual(obj('{“reply”: “그는 \"안녕\" 이라고 했다”, "s":[]}'), { reply: '그는 "안녕" 이라고 했다', s: [] });
  assert.deepEqual(obj('{"text":"첫 줄\n둘째 줄"}'), { text: "첫 줄\n둘째 줄" });
});
test("array mode and failures", () => {
  assert.deepEqual(extractJson('후보: ["가","나",]', "["), ["가", "나"]);
  assert.equal(obj("그냥 글입니다"), undefined);
  assert.equal(obj('{"a":1'), undefined);
});
