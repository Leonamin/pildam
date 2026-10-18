// 설정 노트의 순수 함수: 한 줄 요약(recap)과 제목줄 기준 나누기.

const DECO_HEAD = /^[\s=\-■□·•*#>\[\]]+/;
const DECO_TAIL = /[\s=\-\]]+$/;
const cleanLine = (l: string) => l.replace(DECO_HEAD, "").replace(DECO_TAIL, "").trim();

// 본문 앞쪽 의미 있는 줄(들)에서 장식을 벗긴 ~80자.
export function recap(text: string): string {
  let out = "";
  for (const l of text.split("\n")) {
    const c = cleanLine(l);
    if (!c) continue;
    out = out ? `${out} / ${c}` : c;
    if (out.length >= 30) break;
  }
  return out.slice(0, 80);
}

// 제목줄 패턴. 앞에서부터 시도해 처음으로 쓸 만한 것을 쓴다.
const HEADINGS: { re: RegExp; strip: RegExp }[] = [
  { re: /^#{1,3}\s/, strip: /^#{1,3}\s+/ },
  { re: /^\d+\.\s/, strip: /^\d+\.\s+/ },
  { re: /^■\s?\d+\./, strip: /^■\s?\d+\.\s*/ },
  { re: /^■/, strip: /^■[\s■]*/ },
  { re: /^\[\d+\]/, strip: /^\[\d+\]\s*/ },
];
const MIN_CHUNK = 80;

export type Chunk = { title: string; text: string };
// 조각이 2개 이상이면 반환. 서문(첫 제목 앞 글)은 첫 조각에 합치고, 그 조각의 title은 ""(= 원래 제목 유지).
export function splitNote(text: string): Chunk[] | null {
  const lines = text.split("\n");
  for (const { re, strip } of HEADINGS) {
    const at = lines.flatMap((l, i) => (re.test(l) ? [i] : []));
    if (at.length < 2) continue;
    const secs = at.map((s, k) => lines.slice(s, at[k + 1] ?? lines.length).join("\n").trim());
    if (secs.some((s) => s.length < MIN_CHUNK)) continue;
    const pre = lines.slice(0, at[0]).join("\n").trim();
    const chunks = secs.map((s) => ({ title: (s.split("\n")[0].replace(strip, "").trim() || "제목 없음").slice(0, 80), text: s }));
    if (pre) chunks[0] = { title: "", text: `${pre}\n\n${secs[0]}` };
    return chunks;
  }
  return null;
}
