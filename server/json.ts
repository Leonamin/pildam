// 모델 답에서 JSON 덩어리를 뽑는다. 코드펜스·앞뒤 설명·문자열 속 괄호·끝 쉼표·둥근 따옴표·문자열 속 줄바꿈을 견딘다.
// 못 읽으면 undefined.
const CLOSE: Record<string, string> = { "“": "”", "‘": "’", '"': '"' };

// t[s](여는 괄호)부터 짝이 맞는 곳까지를 JSON.parse가 받을 수 있게 고쳐서 돌려준다. 짝이 안 맞으면 null.
function balanced(t: string, s: number): string | null {
  const out: string[] = [];
  let depth = 0, closer: string | null = null;
  for (let i = s; i < t.length; i++) {
    const c = t[i];
    if (closer) {
      if (c === "\\") { out.push(c, t[++i] ?? ""); continue; }
      if (c === closer) { out.push('"'); closer = null; continue; }
      out.push(c === "\n" ? "\\n" : c === "\r" ? "" : c === "\t" ? "\\t" : c === '"' ? '\\"' : c);
      continue;
    }
    if (c in CLOSE) { out.push('"'); closer = CLOSE[c]; continue; }
    if (c === "{" || c === "[") depth++;
    if (c === "}" || c === "]") {
      while (/\s/.test(out.at(-1) ?? "x")) out.pop();
      if (out.at(-1) === ",") out.pop();
      depth--;
    }
    out.push(c);
    if (depth === 0) return out.join("");
  }
  return null;
}

export function extractJson(text: string, open: "[" | "{"): unknown {
  for (let s = text.indexOf(open); s >= 0; s = text.indexOf(open, s + 1)) {
    const b = balanced(text, s);
    if (!b) continue;
    try {
      const v = JSON.parse(b);
      if (v && typeof v === "object" && Array.isArray(v) === (open === "[")) return v;
    } catch { /* 다음 후보 */ }
  }
  return undefined;
}
