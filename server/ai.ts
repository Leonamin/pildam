// AI 호출: CLI 실행, 컨텍스트 조립(wiki/concepts/context-assembly.md), 엔드포인트.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import type {
  AiTarget, ChatEntry, EditDocResponse, EditGraphResponse, Graph, GraphSuggestion, ModelOption, NodeKind,
  OnboardResponse, RewriteAction, RewriteResponse, StreamEvent, SummarizeResponse, Work,
} from "../shared/types.ts";
import { extractJson } from "./json.ts";
import { indexSection, selectNotes } from "./select.ts";
import {
  ApiErr, appendChat, checkId, fail, findModel, getChapter, getDoc, getGraph, getNote, getWork, KINDS, notesWithText,
  readBody, readChat, readSummary, saveSummary, str,
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
      // agy는 SIGTERM을 무시하고 버틴 적이 있어, 3초 뒤에도 살아 있으면 SIGKILL로 끝낸다.
      const kill = () => {
        child.kill();
        setTimeout(() => child.exitCode === null && child.signalCode === null && child.kill("SIGKILL"), 3000).unref();
      };
      const timer = setTimeout(() => ((timedOut = true), kill()), TIMEOUT_MS);
      signal.addEventListener("abort", kill, { once: true });

      const handle = (line: string) => {
        let o;
        try { o = JSON.parse(line); } catch { return; }
        const p = parseLine(m.provider, o);
        if (p.text) { out += p.text; onDelta(p.text); }
        if (p.err) errText = p.err;
        if (p.final) {
          final = p.final;
          setTimeout(kill, 2000).unref(); // 최종 답을 보낸 뒤에도 agy가 안 끝나는 경우가 있어(긴 답에서 재현), 잠깐 기다렸다 정리한다
        }
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
        if (errText || (code !== 0 && !final)) {
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

type Kind = "write" | "rewrite" | "summarize" | "onboard" | "select" | "edit-doc" | "edit-graph";
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
  select: "연습용 AI는 노트를 고르지 않아요.", // JSON이 아니므로 낱말 일치로 넘어간다
  "edit-doc": "", // 호출한 쪽이 원문에 맞춰 넘긴다
  "edit-graph": "",
};
async function runMock(text: string, signal: AbortSignal, onDelta: (t: string) => void) {
  for (let i = 0; i < text.length; i += 6) {
    if (signal.aborted) throw new ApiErr(499, "ai_failed", "요청이 취소됐어요.");
    await new Promise((r) => setTimeout(r, 40));
    onDelta(text.slice(i, i + 6));
  }
  return text;
}
const run = (m: ModelOption, kind: Kind, prompt: string, signal: AbortSignal, onDelta: (t: string) => void = () => {}, mock = MOCK[kind]) =>
  m.provider === "mock" ? runMock(mock, signal, onDelta) : runCli(m, prompt, signal, onDelta);

// ── 컨텍스트 조립 ──
const TAIL = 12_000;
const SELECT_TIMEOUT_MS = 60_000;
const sec = (title: string, body: string) => (body.trim() ? `[${title}]\n${body.trim()}\n\n` : "");
// 같은 모델로 노트 고르기를 묻는다 (60초 제한, 요청 취소를 따른다).
function asker(model: ModelOption, signal: AbortSignal) {
  return async (prompt: string) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), SELECT_TIMEOUT_MS);
    const abort = () => ac.abort();
    signal.addEventListener("abort", abort, { once: true });
    try {
      return await run(model, "select", prompt, ac.signal);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  };
}
type Req = { workId: string; target: AiTarget; model: ModelOption; signal: AbortSignal; request: string; tail: string; noteIds?: unknown };
const idList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 30) : []);

// "[설정 노트 목록]" + "[설정 노트 본문]". 편집 중인 노트 자신은 뺀다 (본문이 따로 실리므로).
async function notesPart(r: Req): Promise<{ text: string; used: string[] }> {
  const notes = (await notesWithText(r.workId)).filter((n) => r.target.type !== "note" || n.meta.id !== r.target.noteId);
  const { bodies, picked } = await selectNotes({
    notes, userIds: idList(r.noteIds), request: r.request, kind: KIND_LABEL[r.target.type], tail: r.tail, ask: asker(r.model, r.signal),
  });
  return {
    used: picked,
    text: sec("설정 노트 목록", indexSection(notes)) +
      sec("설정 노트 본문 (앞으로 일어날 일·줄거리 계획도 들어 있으니 현재 화보다 앞서 나가지 말 것)", bodies.map((b) => `### ${b.label}\n${b.text.trim()}`).join("\n\n")),
  };
}
const KIND_LABEL: Record<AiTarget["type"], string> = { chapter: "소설 본문 쓰기", style: "문체 지침 고치기", note: "설정 노트 고치기", graph: "관계도 고치기" };

const range = (work: Work, e: { fromChapterId: string | null; toChapterId: string | null }) => {
  const f = work.chapters.findIndex((c) => c.id === e.fromChapterId), t = work.chapters.findIndex((c) => c.id === e.toChapterId);
  return `${f < 0 ? "처음부터" : `${f + 1}화`}~${t < 0 ? "끝까지" : `${t + 1}화`}`;
};
const nodeLines = (g: Graph) => g.nodes.map((n) => `- ${n.name} (${n.kind}): ${n.description}`).join("\n");

// 화 대상이면 그 화 시점의 관계만, 아니면 모든 관계(구간 표시)를 싣는다. text = 대상의 현재 본문.
async function context(r: Req, text: string): Promise<{ ctx: string; used: string[] }> {
  const { workId, target } = r;
  const work = await getWork(workId);
  const cur = target.type === "chapter" ? work.chapters.findIndex((c) => c.id === target.chapterId) : -1;
  if (target.type === "chapter" && cur < 0) fail(404, "not_found", "화를 찾을 수 없어요.");
  const [style, graph, chat, notes] = await Promise.all([
    getDoc(workId, "style"), getGraph(workId), readChat(workId, target, 5), notesPart(r),
  ]);
  const idx = (id: string | null) => (id ? work.chapters.findIndex((c) => c.id === id) : -1);
  // 지워진 화를 가리키는 경계(-1)는 열린 경계로 본다.
  const valid = (e: { fromChapterId: string | null; toChapterId: string | null }) =>
    cur < 0 || ((idx(e.fromChapterId) <= cur) && (idx(e.toChapterId) < 0 || cur <= idx(e.toChapterId)));
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name;
  const edges = graph.edges
    .filter((e) => valid(e) && name(e.source) && name(e.target))
    .map((e) => `- ${name(e.source)} → ${name(e.target)}: ${e.label}${cur < 0 ? ` (${range(work, e)})` : ""}`);
  const at = cur < 0 ? "" : ` (${cur + 1}화 시점)`;
  const sums = cur < 0 ? [] : (await Promise.all(work.chapters.slice(0, cur).map((c, i) => readSummary(workId, c.id).then((s) => s && `${i + 1}화 「${c.title}」: ${s.trim()}`))))
    .filter(Boolean);
  const body = target.type === "chapter" && text.length > TAIL
    ? `(원고가 길어 앞부분은 생략했고, 앞 내용은 위 요약으로 대신합니다. 아래는 원고의 뒷부분입니다.)\n${text.slice(-TAIL)}`
    : text;
  const heading = target.type === "chapter" ? `현재 원고 (${cur + 1}화 「${work.chapters[cur].title}」)` : target.type === "style" ? "고칠 문체 지침" : "고칠 설정 노트";
  return {
    used: notes.used,
    ctx: (target.type === "style" ? "" : sec("문체", style.text)) + notes.text +
      sec(`인물·장소${at}`, nodeLines(graph)) + sec(`관계${at}`, edges.join("\n")) +
      sec("앞 화 요약", sums.join("\n")) + sec(heading, body || "(아직 비어 있음)") +
      sec("최근 지시", chat.map((c: ChatEntry) => `- ${c.instruction}`).join("\n")),
  };
}

const NOVEL_RULES = `당신은 한국어 소설을 대신 써 주는 작가입니다. 위 자료를 바탕으로 요청을 수행하세요.
출력 규칙: 소설 본문만 출력하세요. 머리말, 설명, 마크다운, 따옴표로 감싸기, 목록 없이 글만 쓰고, 문단은 빈 줄로 구분하세요. [문체]가 있으면 그에 맞추세요. 도구나 파일은 쓰지 마세요.`;
const JSON_RULES = "출력 규칙: 설명이나 마크다운 없이 JSON만 출력하세요. 도구나 파일은 쓰지 마세요.";
const SUGGEST_FORMAT = `suggestions는 설정에 반영하면 좋을 변경 제안의 배열이며 없으면 빈 배열입니다. 각 항목은 다음 중 하나입니다.
{"type":"add-node","node":{"name":"이름","kind":"character|place|faction|item","description":"설명"}}
{"type":"add-edge","sourceName":"이름","targetName":"이름","label":"관계"}
{"type":"end-edge","sourceName":"이름","targetName":"이름","label":"끝나는 관계"}`;
const SUGGEST_MORE = `
{"type":"update-node","name":"기존 이름","node":{"name":"새 이름(바꿀 때만)","kind":"바꿀 때만","description":"바꿀 때만"}}
{"type":"remove-node","name":"이름"}
{"type":"remove-edge","sourceName":"이름","targetName":"이름","label":"관계"}`;

// ── 결과 해석 ──
const bad = () => new ApiErr(502, "ai_failed", "AI의 답을 이해하지 못했어요. 다시 시도해 주세요.");
function parseJson(text: string, open: "[" | "{"): unknown {
  const v = extractJson(text, open);
  if (v === undefined) throw bad();
  return v;
}
// JSON을 기대하는 호출. 못 읽으면 이전 답을 보여 주며 한 번만 다시 시킨다.
async function runJson(model: ModelOption, kind: Kind, prompt: string, signal: AbortSignal, mock?: string): Promise<{ j: any; out: string }> {
  let out = await run(model, kind, prompt, signal, undefined, mock);
  let j = extractJson(out, "{");
  if (j === undefined && model.provider !== "mock") {
    out = await run(model, kind, `아래는 당신이 방금 한 답인데 JSON으로 읽을 수 없었습니다. 같은 내용을 유효한 JSON 객체 하나로만 다시 출력하세요. 문자열 안의 큰따옴표는 \\"로, 줄바꿈은 \\n으로 쓰세요. 설명이나 마크다운은 쓰지 마세요.\n\n[이전 답]\n${out}`, signal);
    j = extractJson(out, "{");
  }
  return { j, out };
}
function candidates(text: string): string[] {
  let list: unknown;
  try { list = parseJson(text, "["); } catch { list = text.split(/\n\s*\n|\n-{3,}\n/); }
  const out = (Array.isArray(list) ? list : []).filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  return out.length ? out.slice(0, 3) : (() => { throw bad(); })();
}
// 제안의 화 경계는 모델이 아니라 서버가 정한다 (모델은 화 ID를 모른다).
//  from(x): add-edge의 시작 화 ID, to(x): end-edge의 끝 화 ID (null이면 그 제안은 버린다).
type Bounds = { from: (x: any) => string | null; to: (x: any) => string | null };
function suggestions(v: unknown, b: Bounds): GraphSuggestion[] {
  const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const out: GraphSuggestion[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    if (x?.type === "add-node" && s(x.node?.name)) {
      out.push({ type: "add-node", node: { name: s(x.node.name), kind: KINDS.includes(x.node.kind) ? x.node.kind : "character", description: s(x.node.description) } });
    } else if (x?.type === "update-node" && s(x.name) && x.node && typeof x.node === "object") {
      const node: Partial<{ name: string; kind: NodeKind; description: string }> = {};
      if (s(x.node.name)) node.name = s(x.node.name);
      if (KINDS.includes(x.node.kind)) node.kind = x.node.kind;
      if (typeof x.node.description === "string") node.description = x.node.description.trim();
      if (Object.keys(node).length) out.push({ type: "update-node", name: s(x.name), node });
    } else if (x?.type === "remove-node" && s(x.name)) {
      out.push({ type: "remove-node", name: s(x.name) });
    } else if (x?.type === "add-edge" && s(x.sourceName) && s(x.targetName) && s(x.label)) {
      out.push({ type: "add-edge", sourceName: s(x.sourceName), targetName: s(x.targetName), label: s(x.label), fromChapterId: b.from(x) });
    } else if (x?.type === "end-edge" && s(x.sourceName) && s(x.targetName)) {
      const to = b.to(x);
      if (to) out.push({ type: "end-edge", sourceName: s(x.sourceName), targetName: s(x.targetName), label: s(x.label), toChapterId: to });
    } else if (x?.type === "remove-edge" && s(x.sourceName) && s(x.targetName)) {
      out.push({ type: "remove-edge", sourceName: s(x.sourceName), targetName: s(x.targetName), label: s(x.label) });
    }
  }
  return out;
}
// 요약·온보딩: 지금 화에서 시작, 직전 화에서 끝 (1화면 1화).
const chapterBounds = (chapterId: string | null, prevChapterId: string | null = null): Bounds =>
  ({ from: () => chapterId, to: () => (chapterId ? prevChapterId ?? chapterId : null) });

const prevChapter = (work: Work, chapterId: string) => work.chapters[work.chapters.findIndex((c) => c.id === chapterId) - 1]?.id ?? null;

// ── 엔드포인트 ──
export const ai = new Hono();
const preview = (t: string) => t.trim().slice(0, 80);
const log = (workId: string, target: AiTarget, kind: ChatEntry["kind"], instruction: string, modelId: string, result: string, usedNotes?: string[]) =>
  appendChat(workId, target, { kind, instruction, modelId, resultPreview: preview(result), usedNotes }).catch(console.error);
const badReq = () => fail(400, "bad_request", "요청 내용이 올바르지 않아요.");

ai.post("/works/:workId/ai/write", async (c) => {
  const { workId } = c.req.param();
  const b = await readBody(c.req.raw);
  const chapterId = checkId(b.chapterId);
  const model = await findModel(b.modelId);
  const instruction = str(b.instruction, 4000, 1);
  const manuscript = str(b.manuscript, 400_000);
  const revise = b.mode === "revise";
  if (!revise && b.mode !== "continue") badReq();
  const target = revise ? str(b.reviseTarget, 400_000, 1) : "";
  await getChapter(workId, chapterId); // 없으면 스트림 전에 404

  // 고칠 덩어리는 요청에 따로 싣기 때문에 원고 끝에 있으면 한 번만 보이게 뺀다.
  const body = revise && manuscript.endsWith(target) ? manuscript.slice(0, -target.length) : manuscript;
  const request = revise
    ? `[방금 쓴 부분]\n${target}\n\n[요청]\n${instruction}\n\n위 [방금 쓴 부분]을 요청대로 고쳐 쓰세요. 원고에서 이 부분을 통째로 대체할 글 전체를 출력하세요.`
    : `[요청]\n${instruction}\n\n현재 원고의 끝에서 바로 이어질 새 글을 쓰세요. 이미 있는 원고를 다시 쓰지 말고 이어지는 부분만 출력하세요.`;

  const ac = new AbortController();
  c.req.raw.signal.addEventListener("abort", () => ac.abort());
  c.header("content-type", "application/x-ndjson; charset=utf-8");
  c.header("cache-control", "no-store");
  c.header("x-accel-buffering", "no");
  return stream(c, async (s) => {
    s.onAbort(() => ac.abort());
    const send = (e: StreamEvent) => s.write(JSON.stringify(e) + "\n").catch(() => {});
    try {
      // 노트 고르기가 먼저 돌 수 있어서 조립도 스트림 안에서 한다 (오류가 error 이벤트로 간다).
      const t: AiTarget = { type: "chapter", chapterId };
      const { ctx, used } = await context({ workId, target: t, model, signal: ac.signal, request: instruction, tail: body.slice(-1500), noteIds: b.noteIds }, body);
      await send({ t: "notes", titles: used });
      const text = await run(model, "write", `${ctx}${request}\n\n${NOVEL_RULES}`, ac.signal, (d) => void send({ t: "delta", text: d }));
      await log(workId, t, revise ? "revise" : "write", instruction, model.id, text, used);
      await send({ t: "done" });
    } catch (e) {
      const a = e instanceof ApiErr ? e : new ApiErr(500, "ai_failed", "AI가 글을 만들지 못했어요.");
      if (!(e instanceof ApiErr)) console.error(e);
      await send({ t: "error", error: a.error, message: a.message });
    }
  });
});

// 대상(화·문체·노트)이 실제로 있는지 확인하고 AiTarget으로 만든다.
async function docTarget(workId: string, v: unknown, allowChapter: boolean): Promise<AiTarget> {
  const t = (v ?? {}) as Record<string, unknown>;
  if (t.type === "style") return { type: "style" };
  if (t.type === "note") return (await getNote(workId, checkId(t.noteId)), { type: "note", noteId: t.noteId as string });
  if (t.type === "chapter" && allowChapter) return (await getChapter(workId, checkId(t.chapterId)), { type: "chapter", chapterId: t.chapterId as string });
  return badReq();
}

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
  const target = await docTarget(workId, b.target, true);
  const model = await findModel(b.modelId);
  const manuscript = str(b.manuscript, 400_000);
  const sel = (b.selection ?? {}) as Record<string, unknown>;
  const text = str(sel.text, 400_000, 1);
  const start = Number(sel.start), end = Number(sel.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) badReq();
  const action = String(b.action) as RewriteAction;
  if (!Object.hasOwn(ACTIONS, action)) badReq();
  const custom = action === "custom" ? str(b.instruction, 4000, 1) : "";

  const task = action === "custom" ? `[선택한 부분]에 대해 다음 요청을 수행하세요: ${custom}\n각 후보는 [선택한 부분]을 대체할 글입니다.` : ACTIONS[action];
  const { ctx, used } = await context({
    workId, target, model, signal: c.req.raw.signal, noteIds: b.noteIds,
    request: `${custom || ACTION_LABEL[action]}\n${text.slice(0, 300)}`, tail: manuscript.slice(Math.max(0, start - 1500), start),
  }, manuscript);
  const what = target.type === "chapter" ? "소설 본문" : target.type === "style" ? "문체 지침" : "설정 노트";
  const prompt = `${ctx}[선택한 부분 앞뒤]\n${manuscript.slice(Math.max(0, start - 600), start)}【선택】${manuscript.slice(end, end + 600)}\n\n[선택한 부분]\n${text}\n\n[요청]\n${task}\n서로 다르게 쓴 후보 정확히 3개를 문자열 JSON 배열로 출력하세요. 예: ["후보1","후보2","후보3"]\n각 후보는 ${what}만 담고, ${target.type === "chapter" ? "[문체]를 따르세요." : "원문의 형식과 말투를 따르세요."} ${JSON_RULES}`;
  const out = await run(model, "rewrite", prompt, c.req.raw.signal);
  const result = candidates(out);
  await log(workId, target, "rewrite", custom || ACTION_LABEL[action], model.id, result[0], used);
  return c.json<RewriteResponse>({ candidates: result, usedNotes: used });
});

ai.post("/works/:workId/ai/edit-doc", async (c) => {
  const { workId } = c.req.param();
  const b = await readBody(c.req.raw);
  const target = await docTarget(workId, b.target, false);
  const model = await findModel(b.modelId);
  const instruction = str(b.instruction, 4000, 1);
  const text = str(b.text, 400_000);
  const { ctx, used } = await context({ workId, target, model, signal: c.req.raw.signal, noteIds: b.noteIds, request: instruction, tail: text.slice(-1500) }, text);
  const rules = target.type === "note"
    ? "사용자의 구조와 제목줄은 요청이 없으면 그대로 두세요. 일반 글자로만 쓰고 #, ** 같은 마크다운 기호는 쓰지 마세요. 한국어로 쓰세요."
    : "문체 지침은 AI가 따를 수 있게 구체적으로 쓰되, 요청이 없는 부분은 그대로 두세요. 한국어로 쓰세요.";
  const prompt = `${ctx}[요청]\n${instruction}\n\n위 [${target.type === "style" ? "고칠 문체 지침" : "고칠 설정 노트"}]을 요청대로 고쳐서 전체 새 본문을 만드세요. ${rules}
출력 형식: {"text":"고친 전체 본문"}
${JSON_RULES}`;
  const paras = text.trimEnd().split(/\n\n/);
  if (paras.length > 1) paras[0] = `${paras[0]} (연습용 AI가 고침)`; // 연습용 AI는 첫 문단도 바꿔서 삭제·변경 표시가 보이게 한다
  const { j, out } = await runJson(model, "edit-doc", prompt, c.req.raw.signal, JSON.stringify({ text: `${paras.join("\n\n")}\n\n(연습용 AI가 덧붙인 문단)` }));
  let result: string | null = typeof j?.text === "string" ? j.text : null;
  if (result === null && /^\s*(```|\{)/.test(out)) throw bad(); // JSON처럼 보이는데 못 읽었으면 본문으로 쓰지 않는다
  result ??= out.replace(/^\s*```[a-z]*\n?/i, "").replace(/\n?```\s*$/, "");
  if (!result.trim()) throw bad();
  await log(workId, target, "edit", instruction, model.id, result, used);
  return c.json<EditDocResponse>({ text: result, usedNotes: used });
});

ai.post("/works/:workId/ai/edit-graph", async (c) => {
  const { workId } = c.req.param();
  const b = await readBody(c.req.raw);
  const model = await findModel(b.modelId);
  const instruction = str(b.instruction, 4000, 1);
  const work = await getWork(workId);
  const cur = b.chapterId === null || b.chapterId === undefined ? -1 : work.chapters.findIndex((c) => c.id === checkId(b.chapterId));
  if (b.chapterId && cur < 0) fail(404, "not_found", "화를 찾을 수 없어요.");
  const target: AiTarget = { type: "graph" };
  const [graph, chat, notes] = await Promise.all([
    getGraph(workId), readChat(workId, target, 5),
    notesPart({ workId, target, model, signal: c.req.raw.signal, request: instruction, tail: "", noteIds: b.noteIds }),
  ]);
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name;
  const edges = graph.edges.filter((e) => name(e.source) && name(e.target))
    .map((e) => `- ${name(e.source)} → ${name(e.target)}: ${e.label} (${range(work, e)})`);
  const chapters = work.chapters.map((ch, i) => `${i + 1}화 「${ch.title}」`);
  const prompt = `당신은 소설의 인물·장소 관계도를 관리하는 조수입니다.

${notes.text}${sec("화 목록", chapters.join("\n"))}${sec("현재 인물·장소", nodeLines(graph))}${sec("현재 관계 (구간 포함)", edges.join("\n"))}${sec("최근 지시", chat.map((x) => `- ${x.instruction}`).join("\n"))}[작가가 보고 있는 화] ${cur < 0 ? "전체" : `${cur + 1}화`}

[요청]
${instruction}

요청에 답하고, 관계도에 반영할 변경을 제안하세요. 노드는 항상 이름으로 가리키고, 화는 번호(숫자)로 말하세요. 지금 보고 있는 화가 있고 작가가 따로 말하지 않았다면 그 화를 기준으로 하세요.
출력 형식: {"reply":"짧은 한국어 답","suggestions":[...]}
${SUGGEST_FORMAT.replace('"label":"관계"}', '"label":"관계","fromChapter":시작하는 화 번호 또는 null(처음부터)}').replace('"label":"끝나는 관계"}', '"label":"끝나는 관계","toChapter":관계가 마지막으로 유효한 화 번호}')}${SUGGEST_MORE}
${JSON_RULES}`;
  const first = graph.nodes[0];
  const mock = JSON.stringify({
    reply: "연습용 AI가 관계도 제안을 만들었어요.",
    suggestions: [
      { type: "add-node", node: { name: "연습 인물", kind: "character", description: "연습용 AI가 제안한 인물" } },
      ...(first ? [{ type: "update-node", name: first.name, node: { description: `${first.description} (연습용 AI가 덧붙임)`.trim() } }] : []),
    ],
  });
  const { j } = await runJson(model, "edit-graph", prompt, c.req.raw.signal, mock) as { j: { reply?: unknown; suggestions?: unknown } | undefined };
  if (!j) throw bad();
  const byNo = (n: unknown) => (Number.isInteger(n) && (n as number) >= 1 ? work.chapters[(n as number) - 1]?.id ?? null : null);
  const reply = typeof j?.reply === "string" ? j.reply.trim() : "";
  if (!reply && !Array.isArray(j?.suggestions)) throw bad();
  const sug = suggestions(j.suggestions, { from: (x) => byNo(x.fromChapter), to: (x) => byNo(x.toChapter) });
  await log(workId, target, "graph", instruction, model.id, reply, notes.used);
  return c.json<EditGraphResponse>({ reply: reply || "제안을 만들었어요.", suggestions: sug, usedNotes: notes.used });
});

ai.post("/works/:workId/ai/summarize", async (c) => {
  const { workId } = c.req.param();
  const b = await readBody(c.req.raw);
  const chapterId = checkId(b.chapterId);
  const model = await findModel(b.modelId);
  const chapter = await getChapter(workId, chapterId);
  if (!chapter.text.trim()) fail(400, "bad_request", "내용이 없는 화는 요약할 수 없어요.");

  const target: AiTarget = { type: "chapter", chapterId };
  const { ctx, used } = await context({ workId, target, model, signal: c.req.raw.signal, request: "이 화 요약과 설정 변경 제안", tail: chapter.text.slice(-1500) }, chapter.text);
  const prompt = `${ctx}[요청]
[현재 원고]의 이 화를 요약하세요. 줄거리, 인물의 감정 변화, 밝혀진 설정, 복선을 4~8문장으로 담아, 다음 화를 쓰는 작가가 앞 내용을 떠올릴 수 있게 쓰세요.
또한 이 화에서 새로 나온 인물·장소나 달라진 관계가 [인물·장소], [관계]에 없으면 제안하세요.
출력 형식: {"summary":"요약","suggestions":[...]}
${SUGGEST_FORMAT}${SUGGEST_MORE}
${JSON_RULES}`;
  const { j } = await runJson(model, "summarize", prompt, c.req.raw.signal);
  if (typeof j?.summary !== "string" || !j.summary.trim()) throw bad();
  await saveSummary(workId, chapterId, j.summary.trim());
  await log(workId, target, "summarize", "요약", model.id, j.summary, used);
  return c.json<SummarizeResponse>({
    summary: j.summary.trim(), usedNotes: used,
    suggestions: suggestions(j.suggestions, chapterBounds(chapterId, prevChapter(await getWork(workId), chapterId))),
  });
});

ai.post("/works/:workId/ai/onboard", async (c) => {
  const { workId } = c.req.param();
  const b = await readBody(c.req.raw);
  const model = await findModel(b.modelId);
  await getWork(workId);
  const a = b.answers;
  const answers = typeof a === "string" ? str(a, 20_000, 1)
    : a && typeof a === "object" ? Object.entries(a).map(([k, v]) => `${k}: ${String(v)}`).join("\n").slice(0, 20_000)
    : badReq();

  const prompt = `당신은 소설 기획을 돕는 편집자입니다. 작가가 새 작품에 대해 답한 내용입니다.

${answers}

이 답을 바탕으로 작품의 제목, 세계관, 문체 지침을 한국어로 정리하세요. world는 배경과 규칙을 줄글로, style은 AI가 따를 문체 지시(시점, 문장 길이, 어조, 피할 것 등)로 쓰세요. 답에 없는 내용을 지나치게 지어내지 마세요.
출력 형식: {"title":"제목","world":"세계관","style":"문체","suggestions":[...]}
${SUGGEST_FORMAT}
${JSON_RULES}`;
  const { j } = await runJson(model, "onboard", prompt, c.req.raw.signal);
  if (!j) throw bad();
  const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  if (!s(j?.world) && !s(j?.style)) throw bad();
  return c.json<OnboardResponse>({ title: s(j.title), world: s(j.world), style: s(j.style), suggestions: suggestions(j.suggestions, chapterBounds(null)) });
});
