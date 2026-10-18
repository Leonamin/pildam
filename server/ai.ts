// AI 호출: CLI 실행, 컨텍스트 조립(wiki/concepts/context-assembly.md), 엔드포인트.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import type {
  ChatEntry, GraphSuggestion, ModelOption, NodeKind, OnboardResponse, RewriteAction,
  RewriteResponse, StreamEvent, SummarizeResponse, Work,
} from "../shared/types.ts";
import {
  ApiErr, appendChat, checkId, fail, findModel, getChapter, getDoc, getGraph, getWork, readBody, readChat,
  readSummary, saveSummary, str,
} from "./store.ts";

// ── 실행기 ──
const TIMEOUT_MS = 5 * 60_000;
const MAX_CLI = 2;
let running = 0;

const UNAVAILABLE = "지금 이 AI는 쉬는 중이에요. 다른 AI로 바꿔서 계속할 수 있어요.";
const LIMIT_RE = /rate.?limit|quota|usage limit|limit reached|exceeded|log(?:ged)? ?in|unauthori|expired|credit|\b40[13]\b|\b429\b/i;
const classify = (stderr: string) =>
  LIMIT_RE.test(stderr)
    ? new ApiErr(503, "ai_unavailable", UNAVAILABLE)
    : new ApiErr(502, "ai_failed", "AI가 글을 만들지 못했어요. 다시 시도하거나 다른 AI로 바꿔 보세요.");

// 안전 플래그 (CLI마다 빈 임시 폴더에서, 세션 이어쓰기 없이 실행):
//  claude: 도구 전부 끔, 세션 저장 안 함, 사용자 설정·MCP·스킬 로딩 안 함(컨텍스트 낭비 방지)
//  codex : read-only 샌드박스, 세션 파일 안 남김, 사용자 설정·규칙 무시(auth는 유지)
//  agy   : plan 모드(편집 불가) + 샌드박스. 프롬프트는 인자로만 받는다.
function argv(m: ModelOption, prompt: string): { cmd: string; args: string[]; stdin?: string } {
  switch (m.provider) {
    case "claude":
      return {
        cmd: "claude", stdin: prompt,
        args: ["-p", "--model", m.model, "--tools", "", "--no-session-persistence", "--setting-sources", "",
          "--strict-mcp-config", "--disable-slash-commands",
          "--output-format", "stream-json", "--verbose", "--include-partial-messages"],
      };
    case "codex":
      return {
        cmd: "codex", stdin: prompt,
        args: ["exec", "-m", m.model, "-s", "read-only", "--skip-git-repo-check", "--ephemeral",
          "--ignore-user-config", "--ignore-rules", "--json", "-"],
      };
    default:
      // 인자 하나는 Linux에서 128KB까지다.
      if (Buffer.byteLength(prompt) > 120_000) fail(400, "bad_request", "원고나 설정이 너무 길어서 이 AI로는 보낼 수 없어요. 다른 AI로 바꿔 보세요.");
      return {
        cmd: "agy",
        args: ["--model", m.model, "--output-format", "stream-json", "--sandbox", "--mode", "plan",
          "--print-timeout", "300s", `-p=${prompt}`],
      };
  }
}

// CLI 한 줄(JSON) → 글 조각 / 오류 / 최종 전문
type Parsed = { text?: string; err?: string; final?: string };
function parseLine(provider: string, o: any): Parsed {
  if (provider === "claude") {
    if (o.type === "stream_event" && o.event?.delta?.type === "text_delta") return { text: o.event.delta.text };
    if (o.type === "result") return o.is_error ? { err: String(o.result) } : { final: o.result };
  } else if (provider === "codex") {
    if (o.type === "item.completed" && o.item?.type === "agent_message") return { text: o.item.text };
    if (o.type === "turn.failed" || o.type === "error") return { err: JSON.stringify(o.error ?? o.message) };
  } else if (o.event === "step_update") {
    const s = o.step_update;
    if (s?.step_type === "agent_response" && s.state === "ACTIVE") return { text: s.text_delta };
  } else if (o.event === "result") {
    return o.result?.status === "SUCCESS" ? { final: o.result.response } : { err: JSON.stringify(o.result) };
  }
  return {};
}

async function runCli(m: ModelOption, prompt: string, signal: AbortSignal, onDelta: (t: string) => void) {
  const { cmd, args, stdin } = argv(m, prompt);
  if (running >= MAX_CLI) fail(429, "ai_busy", "지금 다른 요청을 처리하고 있어요. 잠시 뒤에 다시 해 주세요.");
  running++;
  const cwd = await mkdtemp(join(tmpdir(), "pildam-"));
  try {
    return await new Promise<string>((resolve, reject) => {
      if (signal.aborted) return reject(new ApiErr(499, "ai_failed", "요청이 취소됐어요."));
      const child = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
      let out = "", errText = "", stderr = "", buf = "", final = "", timedOut = false;
      const timer = setTimeout(() => ((timedOut = true), child.kill()), TIMEOUT_MS);
      const kill = () => child.kill();
      signal.addEventListener("abort", kill, { once: true });

      const handle = (line: string) => {
        let o;
        try { o = JSON.parse(line); } catch { return; }
        const p = parseLine(m.provider, o);
        if (p.text) { out += p.text; onDelta(p.text); }
        if (p.err) errText = p.err;
        if (p.final) final = p.final;
      };
      child.stdout.setEncoding("utf8").on("data", (d: string) => {
        const lines = (buf + d).split("\n");
        buf = lines.pop()!;
        lines.forEach(handle);
      });
      child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr = (stderr + d).slice(-4000)));
      child.stdin.on("error", () => {});
      child.stdin.end(stdin);
      child.on("error", (e) => (clearTimeout(timer), reject(new ApiErr(502, "ai_failed", `AI 프로그램을 실행하지 못했어요. (${e.message})`))));
      child.on("close", (code) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", kill);
        if (buf) handle(buf);
        if (signal.aborted) return reject(new ApiErr(499, "ai_failed", "요청이 취소됐어요."));
        if (timedOut) return reject(new ApiErr(504, "ai_failed", "AI가 너무 오래 걸려서 멈췄어요. 다시 시도해 주세요."));
        if (errText || code !== 0) {
          console.error(`[ai] ${m.id} 실패 code=${code}\n${errText}\n${stderr}`);
          return reject(classify(`${errText}\n${stderr}`));
        }
        if (!out && final) { out = final; onDelta(final); } // 스트리밍 이벤트가 없던 CLI
        out.trim() ? resolve(out) : reject(new ApiErr(502, "ai_failed", "AI가 빈 답을 보냈어요. 다시 시도해 주세요."));
      });
    });
  } finally {
    running--;
    await rm(cwd, { recursive: true, force: true });
  }
}

type Kind = "write" | "rewrite" | "summarize" | "onboard";
const MOCK: Record<Kind, string> = {
  write: "비는 아침부터 그치지 않았다. 유리창을 타고 흐르는 물줄기를 한참 바라보다가, 그녀는 식어 버린 찻잔을 내려놓았다.\n\n골목 끝에서 낯익은 우산 하나가 천천히 다가오고 있었다. 숨이 잠깐 멎었다.",
  rewrite: JSON.stringify(["빗줄기는 아침부터 멈출 줄을 몰랐다.", "아침부터 내리던 비는 오후가 되어도 그칠 기미가 없었다.", "창밖에서는 종일 비가 쏟아졌다."]),
  summarize: JSON.stringify({
    summary: "비 오는 날, 주인공은 골목 끝에서 다가오는 낯익은 우산을 보고 숨을 멈춘다.",
    suggestions: [{ type: "add-node", node: { name: "연습 인물", kind: "character", description: "연습용 AI가 제안한 인물" } }],
  }),
  onboard: JSON.stringify({
    title: "비 오는 날의 연습", world: "비가 자주 내리는 작은 항구 도시가 배경이다.",
    style: "짧은 문장, 담담한 어조, 감정은 행동으로 보여 준다.",
    suggestions: [{ type: "add-node", node: { name: "연습 인물", kind: "character", description: "주인공" } }],
  }),
};
async function runMock(kind: Kind, signal: AbortSignal, onDelta: (t: string) => void) {
  const text = MOCK[kind];
  for (let i = 0; i < text.length; i += 6) {
    if (signal.aborted) throw new ApiErr(499, "ai_failed", "요청이 취소됐어요.");
    await new Promise((r) => setTimeout(r, 40));
    onDelta(text.slice(i, i + 6));
  }
  return text;
}
const run = (m: ModelOption, kind: Kind, prompt: string, signal: AbortSignal, onDelta: (t: string) => void = () => {}) =>
  m.provider === "mock" ? runMock(kind, signal, onDelta) : runCli(m, prompt, signal, onDelta);

// ── 컨텍스트 조립 ──
const TAIL = 12_000;
async function context(workId: string, chapterId: string, manuscript: string): Promise<string> {
  const work = await getWork(workId);
  const cur = work.chapters.findIndex((c) => c.id === chapterId);
  if (cur < 0) fail(404, "not_found", "화를 찾을 수 없어요.");
  const [world, style, graph, chat] = await Promise.all([
    getDoc(workId, "world"), getDoc(workId, "style"), getGraph(workId), readChat(workId, chapterId, 5),
  ]);
  const idx = (id: string | null) => (id ? work.chapters.findIndex((c) => c.id === id) : -1);
  // 지워진 화를 가리키는 경계(-1)는 열린 경계로 본다.
  const valid = (e: { fromChapterId: string | null; toChapterId: string | null }) =>
    (idx(e.fromChapterId) <= cur) && (idx(e.toChapterId) < 0 || cur <= idx(e.toChapterId));
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name;
  const nodes = graph.nodes.map((n) => `- ${n.name} (${n.kind}): ${n.description}`);
  const edges = graph.edges
    .filter((e) => valid(e) && name(e.source) && name(e.target))
    .map((e) => `- ${name(e.source)} → ${name(e.target)}: ${e.label}`);
  const sums = (await Promise.all(work.chapters.slice(0, cur).map((c, i) => readSummary(workId, c.id).then((s) => s && `${i + 1}화 「${c.title}」: ${s.trim()}`))))
    .filter(Boolean);
  const ms = manuscript.length > TAIL
    ? `(원고가 길어 앞부분은 생략했고, 앞 내용은 위 요약으로 대신합니다. 아래는 원고의 뒷부분입니다.)\n${manuscript.slice(-TAIL)}`
    : manuscript;

  const sec = (title: string, body: string) => (body.trim() ? `[${title}]\n${body.trim()}\n\n` : "");
  return (
    sec("세계관", world.text) + sec("문체", style.text) +
    sec(`인물·장소 (${cur + 1}화 시점)`, nodes.join("\n")) + sec(`관계 (${cur + 1}화 시점)`, edges.join("\n")) +
    sec("앞 화 요약", sums.join("\n")) +
    sec(`현재 원고 (${cur + 1}화 「${work.chapters[cur].title}」)`, ms || "(아직 비어 있음)") +
    sec("최근 지시", chat.map((c: ChatEntry) => `- ${c.instruction}`).join("\n"))
  );
}

const NOVEL_RULES = `당신은 한국어 소설을 대신 써 주는 작가입니다. 위 자료를 바탕으로 요청을 수행하세요.
출력 규칙: 소설 본문만 출력하세요. 머리말, 설명, 마크다운, 따옴표로 감싸기, 목록 없이 글만 쓰고, 문단은 빈 줄로 구분하세요. [문체]가 있으면 그에 맞추세요. 도구나 파일은 쓰지 마세요.`;
const JSON_RULES = "출력 규칙: 설명이나 마크다운 없이 JSON만 출력하세요. 도구나 파일은 쓰지 마세요.";
const SUGGEST_FORMAT = `suggestions는 설정에 반영하면 좋을 변경 제안의 배열이며 없으면 빈 배열입니다. 각 항목은 다음 중 하나입니다.
{"type":"add-node","node":{"name":"이름","kind":"character|place|faction|item","description":"설명"}}
{"type":"add-edge","sourceName":"이름","targetName":"이름","label":"관계"}
{"type":"end-edge","sourceName":"이름","targetName":"이름","label":"끝나는 관계"}`;

// ── 결과 해석 ──
const bad = () => new ApiErr(502, "ai_failed", "AI의 답을 이해하지 못했어요. 다시 시도해 주세요.");
function parseJson(text: string, open: "[" | "{"): unknown {
  const t = text.replace(/```(?:json)?/gi, "");
  const s = t.indexOf(open), e = t.lastIndexOf(open === "[" ? "]" : "}");
  try { return JSON.parse(t.slice(s, e + 1)); } catch { throw bad(); }
}
function candidates(text: string): string[] {
  let list: unknown;
  try { list = parseJson(text, "["); } catch { list = text.split(/\n\s*\n|\n-{3,}\n/); }
  const out = (Array.isArray(list) ? list : []).filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  return out.length ? out.slice(0, 3) : (() => { throw bad(); })();
}
const KINDS: NodeKind[] = ["character", "place", "faction", "item"];
// 제안의 화 경계는 모델이 아니라 서버가 정한다 (모델은 화 ID를 모른다).
// end-edge는 이 화부터 관계가 바뀐 것이므로 직전 화까지로 끝낸다 (1화면 1화).
function suggestions(v: unknown, chapterId: string | null, prevChapterId: string | null = null): GraphSuggestion[] {
  const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const out: GraphSuggestion[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    if (x?.type === "add-node" && s(x.node?.name)) {
      out.push({ type: "add-node", node: { name: s(x.node.name), kind: KINDS.includes(x.node.kind) ? x.node.kind : "character", description: s(x.node.description) } });
    } else if (x?.type === "add-edge" && s(x.sourceName) && s(x.targetName) && s(x.label)) {
      out.push({ type: "add-edge", sourceName: s(x.sourceName), targetName: s(x.targetName), label: s(x.label), fromChapterId: chapterId });
    } else if (x?.type === "end-edge" && chapterId && s(x.sourceName) && s(x.targetName)) {
      out.push({ type: "end-edge", sourceName: s(x.sourceName), targetName: s(x.targetName), label: s(x.label), toChapterId: prevChapterId ?? chapterId });
    }
  }
  return out;
}

const prevChapter = (work: Work, chapterId: string) => work.chapters[work.chapters.findIndex((c) => c.id === chapterId) - 1]?.id ?? null;

// ── 엔드포인트 ──
export const ai = new Hono();
const preview = (t: string) => t.trim().slice(0, 80);
const log = (workId: string, chapterId: string, kind: ChatEntry["kind"], instruction: string, modelId: string, result: string) =>
  appendChat(workId, chapterId, { kind, instruction, modelId, resultPreview: preview(result) }).catch(console.error);

ai.post("/works/:workId/ai/write", async (c) => {
  const { workId } = c.req.param();
  const b = await readBody(c.req.raw);
  const chapterId = checkId(b.chapterId);
  const model = await findModel(b.modelId);
  const instruction = str(b.instruction, 4000, 1);
  const manuscript = str(b.manuscript, 400_000);
  const revise = b.mode === "revise";
  if (!revise && b.mode !== "continue") fail(400, "bad_request", "요청 내용이 올바르지 않아요.");
  const target = revise ? str(b.reviseTarget, 400_000, 1) : "";

  // 고칠 덩어리는 요청에 따로 싣기 때문에 원고 끝에 있으면 한 번만 보이게 뺀다.
  const body = revise && manuscript.endsWith(target) ? manuscript.slice(0, -target.length) : manuscript;
  const request = revise
    ? `[방금 쓴 부분]\n${target}\n\n[요청]\n${instruction}\n\n위 [방금 쓴 부분]을 요청대로 고쳐 쓰세요. 원고에서 이 부분을 통째로 대체할 글 전체를 출력하세요.`
    : `[요청]\n${instruction}\n\n현재 원고의 끝에서 바로 이어질 새 글을 쓰세요. 이미 있는 원고를 다시 쓰지 말고 이어지는 부분만 출력하세요.`;
  const prompt = `${await context(workId, chapterId, body)}${request}\n\n${NOVEL_RULES}`;

  const ac = new AbortController();
  c.req.raw.signal.addEventListener("abort", () => ac.abort());
  c.header("content-type", "application/x-ndjson; charset=utf-8");
  c.header("cache-control", "no-store");
  c.header("x-accel-buffering", "no");
  return stream(c, async (s) => {
    s.onAbort(() => ac.abort());
    const send = (e: StreamEvent) => s.write(JSON.stringify(e) + "\n").catch(() => {});
    try {
      const text = await run(model, "write", prompt, ac.signal, (t) => void send({ t: "delta", text: t }));
      await log(workId, chapterId, revise ? "revise" : "write", instruction, model.id, text);
      await send({ t: "done" });
    } catch (e) {
      const a = e instanceof ApiErr ? e : new ApiErr(500, "ai_failed", "AI가 글을 만들지 못했어요.");
      if (!(e instanceof ApiErr)) console.error(e);
      await send({ t: "error", error: a.error, message: a.message });
    }
  });
});

const ACTIONS: Record<RewriteAction, string> = {
  rewrite: "[선택한 부분]을 같은 뜻과 분위기를 살려 다른 표현으로 다시 쓰세요. 각 후보는 [선택한 부분]을 대체할 글입니다.",
  continue: "[선택한 부분] 바로 뒤에 이어질 글을 쓰세요. 각 후보는 이어지는 새 글만 담고 [선택한 부분]은 반복하지 마세요.",
  describe: "[선택한 부분]에 묘사를 더해 풍성하게 고쳐 쓰세요. 각 후보는 [선택한 부분]을 대체할 글입니다.",
  custom: "",
};
const ACTION_LABEL: Record<RewriteAction, string> = { rewrite: "다시 쓰기", continue: "이어 쓰기", describe: "묘사 더하기", custom: "직접 요청" };
ai.post("/works/:workId/ai/rewrite", async (c) => {
  const { workId } = c.req.param();
  const b = await readBody(c.req.raw);
  const chapterId = checkId(b.chapterId);
  const model = await findModel(b.modelId);
  const manuscript = str(b.manuscript, 400_000);
  const sel = (b.selection ?? {}) as Record<string, unknown>;
  const text = str(sel.text, 400_000, 1);
  const start = Number(sel.start), end = Number(sel.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) fail(400, "bad_request", "요청 내용이 올바르지 않아요.");
  const action = String(b.action) as RewriteAction;
  if (!Object.hasOwn(ACTIONS, action)) fail(400, "bad_request", "요청 내용이 올바르지 않아요.");
  const custom = action === "custom" ? str(b.instruction, 4000, 1) : "";

  const task = action === "custom" ? `[선택한 부분]에 대해 다음 요청을 수행하세요: ${custom}\n각 후보는 [선택한 부분]을 대체할 글입니다.` : ACTIONS[action];
  const prompt = `${await context(workId, chapterId, manuscript)}[선택한 부분 앞뒤]\n${manuscript.slice(Math.max(0, start - 600), start)}【선택】${manuscript.slice(end, end + 600)}\n\n[선택한 부분]\n${text}\n\n[요청]\n${task}\n서로 다르게 쓴 후보 정확히 3개를 문자열 JSON 배열로 출력하세요. 예: ["후보1","후보2","후보3"]\n각 후보는 소설 본문만 담고, [문체]를 따르세요. ${JSON_RULES}`;
  const out = await run(model, "rewrite", prompt, c.req.raw.signal);
  const result = candidates(out);
  await log(workId, chapterId, "rewrite", custom || ACTION_LABEL[action], model.id, result[0]);
  return c.json<RewriteResponse>({ candidates: result });
});

ai.post("/works/:workId/ai/summarize", async (c) => {
  const { workId } = c.req.param();
  const b = await readBody(c.req.raw);
  const chapterId = checkId(b.chapterId);
  const model = await findModel(b.modelId);
  const chapter = await getChapter(workId, chapterId);
  if (!chapter.text.trim()) fail(400, "bad_request", "내용이 없는 화는 요약할 수 없어요.");

  const prompt = `${await context(workId, chapterId, chapter.text)}[요청]
[현재 원고]의 이 화를 요약하세요. 줄거리, 인물의 감정 변화, 밝혀진 설정, 복선을 4~8문장으로 담아, 다음 화를 쓰는 작가가 앞 내용을 떠올릴 수 있게 쓰세요.
또한 이 화에서 새로 나온 인물·장소나 달라진 관계가 [인물·장소], [관계]에 없으면 제안하세요.
출력 형식: {"summary":"요약","suggestions":[...]}
${SUGGEST_FORMAT}
${JSON_RULES}`;
  const out = await run(model, "summarize", prompt, c.req.raw.signal);
  const j = parseJson(out, "{") as { summary?: unknown; suggestions?: unknown };
  if (typeof j?.summary !== "string" || !j.summary.trim()) throw bad();
  await saveSummary(workId, chapterId, j.summary.trim());
  await log(workId, chapterId, "summarize", "요약", model.id, j.summary);
  return c.json<SummarizeResponse>({ summary: j.summary.trim(), suggestions: suggestions(j.suggestions, chapterId, prevChapter(await getWork(workId), chapterId)) });
});

ai.post("/works/:workId/ai/onboard", async (c) => {
  const { workId } = c.req.param();
  const b = await readBody(c.req.raw);
  const model = await findModel(b.modelId);
  await getWork(workId);
  const a = b.answers;
  const answers = typeof a === "string" ? str(a, 20_000, 1)
    : a && typeof a === "object" ? Object.entries(a).map(([k, v]) => `${k}: ${String(v)}`).join("\n").slice(0, 20_000)
    : fail(400, "bad_request", "요청 내용이 올바르지 않아요.");

  const prompt = `당신은 소설 기획을 돕는 편집자입니다. 작가가 새 작품에 대해 답한 내용입니다.

${answers}

이 답을 바탕으로 작품의 제목, 세계관, 문체 지침을 한국어로 정리하세요. world는 배경과 규칙을 줄글로, style은 AI가 따를 문체 지시(시점, 문장 길이, 어조, 피할 것 등)로 쓰세요. 답에 없는 내용을 지나치게 지어내지 마세요.
출력 형식: {"title":"제목","world":"세계관","style":"문체","suggestions":[...]}
${SUGGEST_FORMAT}
${JSON_RULES}`;
  const j = parseJson(await run(model, "onboard", prompt, c.req.raw.signal), "{") as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  if (!s(j?.world) && !s(j?.style)) throw bad();
  return c.json<OnboardResponse>({ title: s(j.title), world: s(j.world), style: s(j.style), suggestions: suggestions(j.suggestions, null) });
});

