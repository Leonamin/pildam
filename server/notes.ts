// 설정 노트의 순수 함수: 한 줄 요약(recap)과 제목줄 기준 나누기.

const DECO_HEAD = /^[\s=\-■□·•*#>\[\]]+/;
const DECO_TAIL = /[\s=\-\]]+$/;
const cleanLine = (l: string) => l.replace(DECO_HEAD, "").replace(/^\d+[.\]]\s*/, "").replace(DECO_TAIL, "").trim();

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
// "■ ■ ■ 등장인물 원본 ■ ■ ■" 같은 구획 띠는 어느 패턴에서든 경계로 본다.
const BANNER = /^■[\s■]*[^■\s].*■\s*$/;

export type Chunk = { title: string; text: string };
// 조각이 2개 이상이면 반환. 서문(첫 제목 앞 글)은 첫 조각에 합치고, 그 조각의 title은 ""(= 원래 제목 유지).
// 80자 미만 조각(예: 본문 속 "1. 항목" 목록)은 앞 조각에 붙인다.
export function splitNote(text: string): Chunk[] | null {
  const lines = text.split("\n");
  for (const { re, strip } of HEADINGS) {
    // 번호 제목은 1, 2, 3…으로 이어질 때만 제목이다 (뒤에 다시 1부터 시작하는 목록은 본문).
    const numbered = re.source.includes("\\d");
    let next = 0;
    const found = lines.flatMap((l, i) => {
      if (BANNER.test(l)) return [i];
      if (!re.test(l)) return [];
      if (!numbered) return [i];
      const n = Number(l.match(/\d+/)![0]);
      if (next && n !== next) return [];
      next = n + 1;
      return [i];
    });
    if (found.length < 2) continue;
    const slice = (a: number, b?: number) => lines.slice(a, b).join("\n").trim();
    const at: number[] = [];
    for (const [k, i] of found.entries()) {
      if (k === 0 || slice(at.at(-1)!, i).length >= MIN_CHUNK) at.push(i);
    }
    if (slice(at.at(-1)!).length < MIN_CHUNK) at.pop();
    if (at.length < 2) continue;
    const secs = at.map((s, k) => slice(s, at[k + 1]));
    const pre = slice(0, at[0]);
    const title = (s: string) => {
      const l = s.split("\n")[0];
      return (BANNER.test(l) ? l.replace(/^[■\s]+/, "") : l.replace(strip, "")).replace(/[■\s]+$/, "").trim().slice(0, 80) || "제목 없음";
    };
    const chunks = secs.map((s) => ({ title: title(s), text: s }));
    if (pre) chunks[0] = { title: "", text: `${pre}\n\n${secs[0]}` };
    return chunks;
  }
  return null;
}
