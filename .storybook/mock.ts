// 데이터 경계 목: window.fetch를 /api/* 한정으로 가로채 고정 픽스처로 답한다. 제품 코드는 그대로 쓴다.
import type { ApiError, EditDocRequest, GraphSuggestion, Me, NoteMeta, ModelOption, OnboardResponse, SummarizeResponse, WorkSummary } from "../shared/types";
import * as F from "./fixtures";

export type MockOpts = {
  me?: Me | null; // null = 로그아웃 상태
  works?: WorkSummary[] | "error";
  workError?: boolean; // GET /api/works/:id 실패
  graphError?: boolean;
  work?: "empty"; // 화가 없는 작품
  graph?: "empty"; // 노드·관계 없음
  models?: ModelOption[];
  ai?: "stream" | "error" | "forever"; // /ai/write 동작
  summarize?: SummarizeResponse;
  onboard?: OnboardResponse | "error";
  deltaDelayMs?: number;
};

const NOW = "2026-01-21T09:00:00.000Z";
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fail = (status: number, error: ApiError["error"], message: string) => json({ error, message }, status);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ndjson(lines: unknown[], delay: number, hang: boolean, signal?: AbortSignal | null) {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(ctl) {
        try {
          for (const l of lines) {
            await sleep(delay);
            if (signal?.aborted) return ctl.error(new DOMException("aborted", "AbortError"));
            ctl.enqueue(enc.encode(JSON.stringify(l) + "\n"));
          }
          if (hang) await new Promise<void>((res) => signal?.addEventListener("abort", () => res()));
          ctl.close();
        } catch { /* 이미 닫힘 */ }
      },
    }),
    { headers: { "Content-Type": "application/x-ndjson" } },
  );
}

/** 스토리마다 새 상태(픽스처 복사본)로 시작한다. */
export function createHandler(o: MockOpts = {}) {
  const works = o.works === "error" ? [] : clone(o.works ?? F.WORKS);
  const work = clone(o.work === "empty" ? F.EMPTY_WORK : F.WORK);
  const graph = clone(o.graph === "empty" ? F.EMPTY_GRAPH : F.GRAPH);
  const texts: Record<string, { text: string; updatedAt: string }> = {};
  const docs: Record<string, { text: string; updatedAt: string }> = {};
  for (const [k, v] of Object.entries(F.DOCS)) docs[k] = { text: v, updatedAt: "2026-01-02T09:00:00.000Z" };
  const notes = clone(F.NOTES);
  const noteText: Record<string, string> = { ...F.NOTE_TEXT };
  const me = o.me === undefined ? F.ME : o.me;
  const delay = o.deltaDelayMs ?? 250;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const p = url.pathname.replace(/^\/api/, "");
    let m: RegExpMatchArray | null;

    if (p === "/me") return me ? json(me) : json(null); // 실제 401은 앱이 /login으로 location.assign 하므로 200 null로 대신한다
    if (p === "/login" && method === "POST") return body.password === "pildam!" ? json(F.ME) : fail(401, "invalid_credentials", "아이디나 비밀번호가 맞지 않아요.");
    if (p === "/logout") return new Response(null, { status: 204 });
    if (p === "/models") return json(o.models ?? F.MODELS);
    if (p === "/works") {
      if (method === "POST") return json({ ...work, id: "w-new", title: body.title, chapters: [] });
      return o.works === "error" ? fail(500, "bad_request", "작품 목록을 가져오지 못했어요.") : json(works);
    }
    if ((m = p.match(/^\/works\/([^/]+)$/))) {
      if (o.workError) return fail(404, "not_found", "작품을 찾을 수 없어요.");
      if (method === "PATCH") Object.assign(work, body);
      if (method === "DELETE") return new Response(null, { status: 204 });
      return json({ ...work, id: m[1] === "w-new" ? m[1] : work.id });
    }
    if ((m = p.match(/^\/works\/[^/]+\/docs\/(\w+)$/))) {
      if (m[1] !== "style") return fail(404, "not_found", "문서를 찾을 수 없어요.");
      const d = docs[m[1]] ?? { text: "", updatedAt: "2026-01-02T09:00:00.000Z" };
      if (method === "PUT") { docs[m[1]] = { text: body.text, updatedAt: "2026-01-21T09:00:00.000Z" }; return json({ updatedAt: docs[m[1]].updatedAt }); }
      return json(d);
    }
    if (/^\/works\/[^/]+\/notes$/.test(p)) {
      if (method === "PATCH") { notes.sort((a, b) => body.order.indexOf(a.id) - body.order.indexOf(b.id)); return json(notes); }
      if (method === "POST") {
        const text = body.text ?? "";
        const n: NoteMeta = { id: `n-${notes.length + 1}`, title: body.title, folder: body.folder, pinned: false, recap: text.slice(0, 40), size: text.length, updatedAt: NOW };
        notes.push(n); noteText[n.id] = text;
        return json(n);
      }
      return json(notes);
    }
    if ((m = p.match(/^\/works\/[^/]+\/notes\/([^/]+)(\/split)?$/))) {
      const i = notes.findIndex((x) => x.id === m![1]);
      if (i < 0) return fail(404, "not_found", "노트를 찾을 수 없어요.");
      const n = notes[i];
      if (m[2]) {
        // 목: "■" 줄을 제목줄로 보고 쪼갠다
        const chunks = noteText[n.id].split(/\n+(?=■)/).filter((c) => c.trim());
        if (chunks.length < 2) return fail(400, "bad_request", "나눌 제목이 없어요.");
        const mkChunk = (c: string, id: string): NoteMeta => ({ ...n, id, title: c.split("\n")[0].replace(/^■\s*(\d+\.\s*)?/, ""), recap: c.replace(/^.*\n/, "").slice(0, 40), size: c.length });
        const made = chunks.map((c, k) => { const id = k ? `${n.id}-${k}` : n.id; noteText[id] = c; return mkChunk(c, id); });
        notes.splice(i, 1, ...made);
        return json(notes);
      }
      if (method === "PUT") { noteText[n.id] = body.text; n.size = body.text.length; n.recap = body.text.slice(0, 40); n.updatedAt = NOW; return json({ updatedAt: NOW }); }
      if (method === "PATCH") { Object.assign(n, body); return json(n); }
      if (method === "DELETE") { notes.splice(i, 1); return new Response(null, { status: 204 }); }
      return json({ meta: n, text: noteText[n.id], updatedAt: n.updatedAt });
    }
    if (/^\/works\/[^/]+\/chat$/.test(p)) return json(F.CHAT_BY_TARGET[url.searchParams.get("target") ?? ""] ?? []);
    if (/^\/works\/[^/]+\/graph$/.test(p)) {
      if (o.graphError) return fail(500, "bad_request", "관계도를 가져오지 못했어요.");
      if (method === "PUT") { Object.assign(graph, body.graph, { updatedAt: "2026-01-21T09:00:00.000Z" }); return json({ updatedAt: graph.updatedAt }); }
      return json(graph);
    }
    if (/^\/works\/[^/]+\/chapters$/.test(p) && method === "POST") {
      const c = { id: "c-new", title: body.title, updatedAt: "2026-01-21T09:00:00.000Z", hasSummary: false };
      work.chapters.push(c);
      return json(c);
    }
    if ((m = p.match(/^\/works\/[^/]+\/chapters\/([^/]+)(\/\w+)?(?:\/(\w+))?$/))) {
      const [, id, sub] = m;
      if (sub === "/snapshots") return m[3] ? json({ text: "이전 본문" }) : json(F.SNAPSHOTS);
      if (method === "PUT") { texts[id] = { text: body.text, updatedAt: "2026-01-21T09:00:00.000Z" }; return json({ updatedAt: texts[id].updatedAt }); }
      if (method === "PATCH") { const c = work.chapters.find((x) => x.id === id); if (c) c.title = body.title; return json(c); }
      if (method === "DELETE") return new Response(null, { status: 204 });
      const base = F.CHAPTER_TEXT[id] !== undefined ? F.chapterOf(id) : { meta: work.chapters.find((x) => x.id === id)!, text: "", updatedAt: "2026-01-21T09:00:00.000Z", summary: null };
      return json({ ...base, ...texts[id] });
    }
    if (/\/ai\/write$/.test(p)) {
      if (o.ai === "error") return ndjson([{ t: "error", error: "ai_unavailable", message: "AI를 지금은 쓸 수 없어요. 잠시 뒤 다시 해 주세요." }], 50, false, init?.signal);
      const deltas = [{ t: "notes", titles: F.USED }, ...F.AI_DELTAS.map((text) => ({ t: "delta", text }))];
      return ndjson(o.ai === "forever" ? deltas : [...deltas, { t: "done" }], delay, o.ai === "forever", init?.signal);
    }
    if (/\/ai\/summarize$/.test(p)) return json(o.summarize ?? F.SUMMARIZE);
    if (/\/ai\/onboard$/.test(p)) return o.onboard === "error" ? fail(503, "ai_unavailable", "AI를 지금은 쓸 수 없어요.") : json(o.onboard ?? F.ONBOARD);
    if (/\/ai\/rewrite$/.test(p)) return json({ candidates: ["첫 번째 후보", "두 번째 후보", "세 번째 후보"], usedNotes: F.USED });
    if (/\/ai\/edit-doc$/.test(p)) {
      // 목: 첫 문단은 고치고, 둘째는 지우고, 끝에 새 문단을 더한다 → 비교에 삭제·추가가 모두 보인다
      const ps = (body as EditDocRequest).text.trim().split(/\n{2,}/);
      const out = ps.length >= 3 ? [`${ps[0]} (더 짧게 다듬음)`, ...ps.slice(2)] : [`${ps[0]} (더 짧게 다듬음)`, ...ps.slice(1)];
      return json({ text: [...out, "새로 더한 문단: 장면 끝은 한 줄로 닫는다."].join("\n\n"), usedNotes: F.USED });
    }
    if (/\/ai\/edit-graph$/.test(p)) {
      const suggestions: GraphSuggestion[] = [
        { type: "update-node", name: "서윤", node: { description: "극장 단골. 새벽회를 쫓는다." } },
        { type: "remove-edge", sourceName: "서윤", targetName: "새벽회", label: "적대" },
        { type: "add-edge", sourceName: "도현", targetName: "새벽회", label: "협력", fromChapterId: "c3" },
      ];
      return json({ reply: "서윤의 설명을 고치고, 적대 관계는 지우고, 3화부터 도현과 새벽회의 협력을 더하는 걸 제안해요.", suggestions, usedNotes: F.USED });
    }
    return fail(404, "not_found", `목에 없는 요청: ${method} ${p}`);
  };
}

let realFetch: typeof fetch | undefined;
/** /api/*만 목으로 보내고 나머지(Vite 자산 등)는 진짜 fetch로 둔다. */
export function installMock(o?: MockOpts) {
  realFetch ??= window.fetch.bind(window);
  const handler = createHandler(o);
  window.fetch = ((input, init) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new URL(u, location.href).pathname.startsWith("/api/") ? handler(input, init) : realFetch!(input, init);
  }) as typeof fetch;
}
