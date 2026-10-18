// 파일 저장소. 구조는 wiki/concepts/data-layout.md.
import { randomUUID } from "node:crypto";
import { access, appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  ApiError, Chapter, ChapterMeta, ChatEntry, DocName, Graph, ModelOption, Provider, SnapshotMeta,
  SnapshotReason, TextDoc, Work, WorkSummary,
} from "../shared/types.ts";

export const dataDir = resolve(process.env.PILDAM_DATA ?? "./data");
const worksDir = join(dataDir, "works");

// ── 오류 · 입력 검증 ──
export class ApiErr extends Error {
  status: number;
  error: ApiError["error"];
  constructor(status: number, error: ApiError["error"], message: string) {
    super(message);
    this.status = status;
    this.error = error;
  }
}
export const fail = (status: number, error: ApiError["error"], message: string): never => {
  throw new ApiErr(status, error, message);
};
const badRequest = () => fail(400, "bad_request", "요청 내용이 올바르지 않아요.");

const ID = /^[a-z0-9-]{1,40}$/;
export const checkId = (id: unknown): string => (typeof id === "string" && ID.test(id) ? id : badRequest());
export const str = (v: unknown, max: number, min = 0): string =>
  typeof v === "string" && v.length >= min && v.length <= max ? v : badRequest();
export const DOC_NAMES: DocName[] = ["world", "style", "notes"];
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const b: unknown = await req.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : badRequest();
}

// ── 파일 도구 ──
const now = () => new Date().toISOString();
const newId = () => randomUUID().slice(0, 8);
export async function writeAtomic(path: string, data: string) {
  const tmp = `${path}.${newId()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}
async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
const exists = (path: string) => access(path).then(() => true, () => false);

// ── 작품 파일 (work.json) ──
// docs: 설정 문서·관계도의 updatedAt. 챕터의 updatedAt은 chapters[]에 둔다.
type WorkFile = {
  id: string; title: string; createdAt: string; updatedAt: string; modelId: string;
  chapters: { id: string; title: string; updatedAt: string }[];
  docs: Record<string, string>;
};
const dir = (workId: string) => join(worksDir, checkId(workId));

async function loadWork(workId: string): Promise<WorkFile> {
  const t = await readText(join(dir(workId), "work.json"));
  return t ? JSON.parse(t) : fail(404, "not_found", "작품을 찾을 수 없어요.");
}
const saveWork = (w: WorkFile) => writeAtomic(join(dir(w.id), "work.json"), JSON.stringify(w, null, 2));

// 작품별 직렬화: 읽고-고치고-쓰는 흐름이 겹쳐 서로 덮어쓰지 않게 한다.
// ponytail: 프로세스 하나 전제. 작품 수만큼 Map이 남지만 무시할 크기.
const locks = new Map<string, Promise<unknown>>();
function locked<T>(workId: string, run: () => Promise<T>): Promise<T> {
  const next = (locks.get(workId) ?? Promise.resolve()).catch(() => {}).then(run);
  locks.set(workId, next);
  return next;
}
// fn이 끝나면 작품 updatedAt을 올려 저장한다.
const mutate = <T>(workId: string, fn: (w: WorkFile) => Promise<T> | T): Promise<T> =>
  locked(workId, async () => {
    const w = await loadWork(workId);
    const r = await fn(w);
    w.updatedAt = now();
    await saveWork(w);
    return r;
  });

async function toWork(w: WorkFile): Promise<Work> {
  const chapters = await Promise.all(w.chapters.map((c) => chapterMeta(w.id, c)));
  return { id: w.id, title: w.title, createdAt: w.createdAt, updatedAt: w.updatedAt, modelId: w.modelId, chapters };
}
async function chapterMeta(workId: string, c: WorkFile["chapters"][number]): Promise<ChapterMeta> {
  return { ...c, hasSummary: await exists(join(dir(workId), "chapters", `${c.id}.summary.txt`)) };
}
const findChapter = (w: WorkFile, chapterId: string) =>
  w.chapters.find((c) => c.id === checkId(chapterId)) ?? fail(404, "not_found", "화를 찾을 수 없어요.");

// ── 모델 ──
export async function models(): Promise<ModelOption[]> {
  const file = join(dataDir, "models.json");
  let list = JSON.parse((await readText(file)) ?? "null") as { provider: Provider; model: string; alias?: string }[] | null;
  if (!list) {
    list = [
      { provider: "agy", model: "gemini-4-argon-high", alias: "꼼꼼한 작가" },
      { provider: "agy", model: "gemini-4-argon-medium" },
      { provider: "agy", model: "gemini-3.8-flash-medium", alias: "빠른 작가" },
      { provider: "claude", model: "claude-opus-5-5" },
      { provider: "codex", model: "gpt-6.1-sol" },
    ];
    await mkdir(dataDir, { recursive: true });
    await writeAtomic(file, JSON.stringify(list, null, 2));
  }
  if (process.env.PILDAM_AI_MOCK === "1") list = [...list, { provider: "mock", model: "mock", alias: "연습용 AI" }];
  return list.map((m) => ({
    id: `${m.provider}:${m.model}`, provider: m.provider, model: m.model, alias: m.alias,
    label: m.alias ? `${m.alias} (${m.model})` : m.model,
  }));
}
export async function findModel(id: unknown): Promise<ModelOption> {
  return (await models()).find((m) => m.id === id) ?? fail(400, "bad_request", "사용할 수 없는 AI예요.");
}

// ── 작품 ──
export async function listWorks(): Promise<WorkSummary[]> {
  const ids = await readdir(worksDir).catch(() => [] as string[]);
  const all = await Promise.all(ids.map((id) => loadWork(id).catch(() => null)));
  return all
    .filter((w) => w !== null)
    .map((w) => ({ id: w.id, title: w.title, updatedAt: w.updatedAt, chapterCount: w.chapters.length }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function createWork(title: string): Promise<Work> {
  const t = now();
  const w: WorkFile = {
    id: newId(), title, createdAt: t, updatedAt: t, modelId: (await models())[0].id, chapters: [], docs: {},
  };
  await mkdir(join(dir(w.id), "chapters"), { recursive: true });
  await saveWork(w);
  return toWork(w);
}
export const getWork = async (workId: string) => toWork(await loadWork(workId));
export async function patchWork(
  workId: string, p: { title?: unknown; modelId?: unknown; chapterOrder?: unknown },
): Promise<Work> {
  const modelId = p.modelId === undefined ? undefined : (await findModel(p.modelId)).id;
  await mutate(workId, (w) => {
    if (p.title !== undefined) w.title = str(p.title, 200, 1);
    if (modelId) w.modelId = modelId;
    if (p.chapterOrder !== undefined) {
      const o = p.chapterOrder;
      const ids = w.chapters.map((c) => c.id);
      if (!Array.isArray(o) || o.length !== ids.length || !ids.every((i) => o.includes(i))) badRequest();
      w.chapters = (o as string[]).map((i) => w.chapters.find((c) => c.id === i)!);
    }
  });
  return getWork(workId);
}
export const deleteWork = (workId: string) =>
  locked(workId, async () => {
    await loadWork(workId);
    await rm(dir(workId), { recursive: true });
  });

// ── 설정 문서 · 관계도 ──
export async function getDoc(workId: string, name: DocName): Promise<TextDoc> {
  const w = await loadWork(workId);
  return { text: (await readText(join(dir(workId), `${name}.txt`))) ?? "", updatedAt: w.docs[name] ?? "" };
}
export const putDoc = (workId: string, name: DocName, text: string, base: string) =>
  mutate(workId, async (w) => {
    if ((w.docs[name] ?? "") !== base) fail(409, "conflict", "다른 곳에서 먼저 저장된 내용이 있어요.");
    await writeAtomic(join(dir(workId), `${name}.txt`), text);
    return { updatedAt: (w.docs[name] = now()) };
  });

export async function getGraph(workId: string): Promise<Graph> {
  const w = await loadWork(workId);
  const g = JSON.parse((await readText(join(dir(workId), "graph.json"))) ?? '{"nodes":[],"edges":[]}');
  return { nodes: g.nodes, edges: g.edges, updatedAt: w.docs.graph ?? "" };
}
export const putGraph = (workId: string, graph: { nodes?: unknown; edges?: unknown }, base: string) =>
  mutate(workId, async (w) => {
    if ((w.docs.graph ?? "") !== base) fail(409, "conflict", "다른 곳에서 먼저 저장된 내용이 있어요.");
    await writeAtomic(join(dir(workId), "graph.json"), JSON.stringify({ nodes: graph.nodes, edges: graph.edges }, null, 2));
    return { updatedAt: (w.docs.graph = now()) };
  });

// ── 화 ──
const chapterPath = (workId: string, chapterId: string, ext = "txt") =>
  join(dir(workId), "chapters", `${checkId(chapterId)}.${ext}`);

export const createChapter = (workId: string, title: string) =>
  mutate(workId, async (w) => {
    const c = { id: newId(), title, updatedAt: now() };
    await writeAtomic(chapterPath(workId, c.id), "");
    w.chapters.push(c);
    return { ...c, hasSummary: false };
  });
export async function getChapter(workId: string, chapterId: string): Promise<Chapter> {
  const c = findChapter(await loadWork(workId), chapterId);
  return {
    meta: await chapterMeta(workId, c),
    text: (await readText(chapterPath(workId, c.id))) ?? "",
    updatedAt: c.updatedAt,
    summary: await readSummary(workId, c.id),
  };
}
export const readSummary = (workId: string, chapterId: string) => readText(chapterPath(workId, chapterId, "summary.txt"));

export const putChapter = (workId: string, chapterId: string, text: string, base: string, snapshot?: SnapshotReason) =>
  mutate(workId, async (w) => {
    const c = findChapter(w, chapterId);
    if (c.updatedAt !== base) fail(409, "conflict", "다른 곳에서 먼저 저장된 내용이 있어요.");
    const old = await readText(chapterPath(workId, c.id));
    if (snapshot && old) await snap(workId, c.id, old, snapshot);
    await writeAtomic(chapterPath(workId, c.id), text);
    return { updatedAt: (c.updatedAt = now()) };
  });
export const patchChapter = (workId: string, chapterId: string, title: string) =>
  mutate(workId, async (w) => {
    const c = findChapter(w, chapterId);
    c.title = title;
    return chapterMeta(workId, c);
  });
export const deleteChapter = (workId: string, chapterId: string) =>
  mutate(workId, async (w) => {
    const c = findChapter(w, chapterId);
    w.chapters = w.chapters.filter((x) => x !== c);
    const d = dir(workId);
    await Promise.all([
      rm(chapterPath(workId, c.id), { force: true }),
      rm(chapterPath(workId, c.id, "summary.txt"), { force: true }),
      rm(join(d, "chat", `${c.id}.jsonl`), { force: true }),
      rm(join(d, "history", c.id), { recursive: true, force: true }),
    ]);
  });

export const saveSummary = (workId: string, chapterId: string, summary: string) =>
  mutate(workId, async (w) => {
    findChapter(w, chapterId);
    await writeAtomic(chapterPath(workId, chapterId, "summary.txt"), summary);
  });

// ── 스냅샷: history/<챕터ID>/<시각>_<사유>.txt, 최근 50개 ──
const snapDir = (workId: string, chapterId: string) => join(dir(workId), "history", checkId(chapterId));
async function snap(workId: string, chapterId: string, text: string, reason: SnapshotReason) {
  const d = snapDir(workId, chapterId);
  await mkdir(d, { recursive: true });
  await writeFile(join(d, `${now().replace(/[:.]/g, "-")}_${reason}.txt`), text);
  const names = (await readdir(d)).sort();
  await Promise.all(names.slice(0, -50).map((n) => rm(join(d, n))));
}
export async function listSnapshots(workId: string, chapterId: string): Promise<SnapshotMeta[]> {
  findChapter(await loadWork(workId), chapterId);
  const d = snapDir(workId, chapterId);
  const names = (await readdir(d).catch(() => [] as string[])).sort().reverse();
  return Promise.all(names.map(async (n) => ({
    id: n.slice(0, -4),
    createdAt: (await stat(join(d, n))).mtime.toISOString(),
    reason: n.slice(0, -4).split("_")[1] as SnapshotReason,
    preview: (await readFile(join(d, n), "utf8")).slice(0, 60),
  })));
}
export async function getSnapshot(workId: string, chapterId: string, snapshotId: string) {
  if (!/^[0-9TZa-z_-]{1,60}$/.test(snapshotId)) badRequest();
  findChapter(await loadWork(workId), chapterId);
  const t = await readText(join(snapDir(workId, chapterId), `${snapshotId}.txt`));
  return { text: t ?? fail(404, "not_found", "기록을 찾을 수 없어요.") };
}

// ── 지시 기록: chat/<챕터ID>.jsonl ──
export async function readChat(workId: string, chapterId: string, last?: number): Promise<ChatEntry[]> {
  const t = (await readText(join(dir(workId), "chat", `${checkId(chapterId)}.jsonl`))) ?? "";
  const all = t.split("\n").filter(Boolean).map((l) => JSON.parse(l) as ChatEntry);
  return last ? all.slice(-last) : all;
}
export const appendChat = (workId: string, chapterId: string, e: Omit<ChatEntry, "id" | "at">) =>
  mutate(workId, async (w) => {
    findChapter(w, chapterId);
    const d = join(dir(workId), "chat");
    await mkdir(d, { recursive: true });
    await appendFile(join(d, `${chapterId}.jsonl`), JSON.stringify({ id: newId(), at: now(), ...e }) + "\n");
  });
