// 설정 노트 고르기. 목록은 항상 보내고, 본문은 작으면 전부 / 크면 pinned + 사용자 지정 + AI가 고른 것(실패 시 낱말 일치).
import { ApiErr } from "./store.ts";
import type { NoteMeta } from "../shared/types.ts";

export type NoteDoc = { meta: NoteMeta; text: string };
export const noteLabel = (m: NoteMeta) => (m.folder ? `${m.folder} › ${m.title}` : m.title);

export const ALL_LIMIT = 20_000; // 노트 전체가 이 이하면 본문을 전부 보낸다
export const BODY_BUDGET = 20_000; // 선택해서 보낼 때 본문 글자 상한
const MAX_PICK = 6;

const tokens = (s: string) => [...new Set(s.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2))];
// "휘령이" 같은 조사 붙은 말도 잡도록 끝 한 글자를 뗀 형태를 함께 쓴다.
const withStems = (ts: string[]) => [...new Set(ts.flatMap((t) => (t.length >= 3 ? [t, t.slice(0, -1)] : [t])))];
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

// 요청에 나온 낱말은 제목·요약·본문에, 최근 글에 나온 이름은 제목·요약에 맞춰 점수를 매긴다.
export function keywordRank(notes: NoteDoc[], request: string, recent: string): string[] {
  const req = withStems(tokens(request)), rec = withStems(tokens(recent));
  return notes
    .map(({ meta, text }) => {
      let s = 0;
      for (const t of req) s += (meta.title.includes(t) ? 5 : 0) + (meta.recap.includes(t) ? 3 : 0) + Math.min(count(text, t), 10);
      for (const t of rec) s += (meta.title.includes(t) ? 2 : 0) + (meta.recap.includes(t) ? 1 : 0);
      return { id: meta.id, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
}

function parseIds(out: string): string[] | null {
  const t = out.replace(/```(?:json)?/gi, "");
  try {
    const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    return Array.isArray(j.ids) ? j.ids.filter((x: unknown): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

export const indexSection = (notes: NoteDoc[]) => notes.map((n) => `- ${noteLabel(n.meta)}: ${n.meta.recap}`).join("\n");

type Args = {
  notes: NoteDoc[]; userIds: string[]; request: string; kind: string; tail: string;
  ask: (prompt: string) => Promise<string>; // 같은 모델로 짧게 묻는다
};
// 본문을 보낼 노트와 그 본문을 돌려준다. ai_unavailable 말고는 오류를 삼키고 낱말 일치로 대신한다.
export async function selectNotes(a: Args): Promise<{ bodies: { label: string; text: string }[]; picked: string[] }> {
  const total = a.notes.reduce((n, d) => n + d.meta.size, 0);
  const byId = new Map(a.notes.map((d) => [d.meta.id, d]));
  let order: string[];
  if (total <= ALL_LIMIT) {
    order = a.notes.map((d) => d.meta.id);
  } else {
    const forced = [...a.notes.filter((d) => d.meta.pinned).map((d) => d.meta.id), ...a.userIds.filter((i) => byId.has(i))];
    const rest = a.notes.filter((d) => !forced.includes(d.meta.id));
    let chosen: string[] | null = null;
    if (rest.length) {
      const prompt = `당신은 소설 작가를 돕는 조수입니다. 아래 설정 노트 목록에서, 이 요청을 수행하는 데 본문이 꼭 필요한 노트를 고르세요.

[설정 노트 목록]
${rest.map((d) => `- id=${d.meta.id} | ${noteLabel(d.meta)}: ${d.meta.recap}`).join("\n")}

[작업 대상] ${a.kind}
[최근 글의 끝부분]
${a.tail.slice(-1500) || "(없음)"}

[요청]
${a.request}

필요한 노트의 id만 최대 ${MAX_PICK}개, 중요한 순서대로 고르세요. 필요 없으면 빈 배열입니다.
출력 형식: {"ids":["id1","id2"]}
출력 규칙: 설명이나 마크다운 없이 JSON만 출력하세요. 도구나 파일은 쓰지 마세요.`;
      try {
        chosen = parseIds(await a.ask(prompt));
      } catch (e) {
        if (e instanceof ApiErr && e.error === "ai_unavailable") throw e;
      }
      chosen = (chosen ?? keywordRank(rest, a.request, a.tail)).filter((i) => rest.some((d) => d.meta.id === i)).slice(0, MAX_PICK);
    }
    order = [...new Set([...forced, ...(chosen ?? [])])];
  }
  const bodies: { label: string; text: string }[] = [];
  const picked: string[] = [];
  let left = BODY_BUDGET;
  for (const id of order) {
    const d = byId.get(id);
    if (!d || !d.text.trim()) continue;
    if (left < 200) break;
    const cut = d.text.length > left;
    bodies.push({ label: noteLabel(d.meta), text: cut ? `${d.text.slice(0, left)}\n(분량 때문에 여기서 줄임)` : d.text });
    picked.push(noteLabel(d.meta));
    left -= d.text.length;
  }
  return { bodies, picked };
}
