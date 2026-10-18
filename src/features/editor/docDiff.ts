// 문단 단위 비교(LCS). 문체·노트를 AI가 고친 결과를 원문 위에 보여 줄 때 쓴다. DOM 의존 없음.

/** old[at .. at+del) 문단을 add 문단들로 바꾼다. del=0이면 끼워 넣기, add가 비면 지우기. */
export type Hunk = { at: number; del: number; add: string[] };

export function diffParagraphs(a: string[], b: string[]): Hunk[] {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const x = a.slice(head, a.length - tail);
  const y = b.slice(head, b.length - tail);
  const n = x.length, m = y.length, w = m + 1;
  // lcs[i*w+j] = x[i..], y[j..]의 최장 공통 부분열 길이
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i * w + j] = x[i] === y[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);

  const hunks: Hunk[] = [];
  let cur: Hunk | null = null;
  const open = (i: number) => (cur ??= (hunks.push({ at: head + i, del: 0, add: [] }), hunks[hunks.length - 1]));
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) { cur = null; i++; j++; }
    else if (j < m && (i === n || lcs[i * w + j + 1] >= lcs[(i + 1) * w + j])) open(i).add.push(y[j++]);
    else { open(i).del++; i++; }
  }
  return hunks;
}

/** hunk를 old에 적용하면 new가 된다(검증용). */
export function applyHunks(old: string[], hunks: Hunk[]): string[] {
  const out: string[] = [];
  let p = 0;
  for (const h of hunks) {
    out.push(...old.slice(p, h.at), ...h.add);
    p = h.at + h.del;
  }
  return [...out, ...old.slice(p)];
}
