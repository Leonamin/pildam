import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { relative, resolve } from "node:path";
import type { ApiError, DocName, SnapshotReason } from "../shared/types.ts";
import { ai } from "./ai.ts";
import { auth, sessionUser } from "./auth.ts";
import * as store from "./store.ts";
import { ApiErr, checkId, DOC_NAMES, fail, readBody, str } from "./store.ts";

const app = new Hono();

app.onError((e, c) => {
  if (e instanceof ApiErr) return c.json<ApiError>({ error: e.error, message: e.message }, e.status as 400);
  console.error(e);
  // ApiError에 서버 내부 오류 코드가 없어서 bad_request에 500을 붙인다.
  return c.json<ApiError>({ error: "bad_request", message: "서버에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요." }, 500);
});

app.use("/api/*", bodyLimit({
  maxSize: 2_000_000,
  onError: (c) => c.json<ApiError>({ error: "bad_request", message: "내용이 너무 길어요." }, 413),
}));
app.use("/api/*", async (c, next) => {
  if (c.req.path !== "/api/login" && !sessionUser(c)) fail(401, "unauthorized", "로그인이 필요해요.");
  await next();
  c.header("Cache-Control", "no-store"); // 원고가 브라우저 캐시에서 옛 내용으로 뜨지 않게
});
app.route("/api", auth);
app.route("/api", ai);

const SNAPSHOT_REASONS: SnapshotReason[] = ["ai-write", "ai-rewrite", "restore", "manual"];
const docName = (v: string): DocName => (DOC_NAMES.includes(v as DocName) ? (v as DocName) : fail(404, "not_found", "찾을 수 없어요."));

app.get("/api/models", async (c) => c.json(await store.models()));

app.get("/api/works", async (c) => c.json(await store.listWorks()));
app.post("/api/works", async (c) => c.json(await store.createWork(str((await readBody(c.req.raw)).title, 200, 1))));
app.get("/api/works/:workId", async (c) => c.json(await store.getWork(c.req.param("workId"))));
app.patch("/api/works/:workId", async (c) => c.json(await store.patchWork(c.req.param("workId"), await readBody(c.req.raw))));
app.delete("/api/works/:workId", async (c) => (await store.deleteWork(c.req.param("workId")), c.body(null, 204)));

app.get("/api/works/:workId/docs/:name", async (c) =>
  c.json(await store.getDoc(c.req.param("workId"), docName(c.req.param("name")))));
app.put("/api/works/:workId/docs/:name", async (c) => {
  const b = await readBody(c.req.raw);
  return c.json(await store.putDoc(c.req.param("workId"), docName(c.req.param("name")), str(b.text, 400_000), str(b.baseUpdatedAt, 50)));
});

app.get("/api/works/:workId/graph", async (c) => c.json(await store.getGraph(c.req.param("workId"))));
app.put("/api/works/:workId/graph", async (c) => {
  const b = await readBody(c.req.raw);
  const g = b.graph as { nodes?: unknown; edges?: unknown } | undefined;
  if (!Array.isArray(g?.nodes) || !Array.isArray(g?.edges)) fail(400, "bad_request", "요청 내용이 올바르지 않아요.");
  return c.json(await store.putGraph(c.req.param("workId"), g!, str(b.baseUpdatedAt, 50)));
});

app.post("/api/works/:workId/chapters", async (c) =>
  c.json(await store.createChapter(c.req.param("workId"), str((await readBody(c.req.raw)).title, 200, 1))));
app.get("/api/works/:workId/chapters/:chapterId", async (c) =>
  c.json(await store.getChapter(c.req.param("workId"), c.req.param("chapterId"))));
app.put("/api/works/:workId/chapters/:chapterId", async (c) => {
  const b = await readBody(c.req.raw);
  const snapshot = b.snapshot === undefined ? undefined : SNAPSHOT_REASONS.find((r) => r === b.snapshot) ?? fail(400, "bad_request", "요청 내용이 올바르지 않아요.");
  return c.json(await store.putChapter(c.req.param("workId"), c.req.param("chapterId"), str(b.text, 400_000), str(b.baseUpdatedAt, 50), snapshot));
});
app.patch("/api/works/:workId/chapters/:chapterId", async (c) =>
  c.json(await store.patchChapter(c.req.param("workId"), c.req.param("chapterId"), str((await readBody(c.req.raw)).title, 200, 1))));
app.delete("/api/works/:workId/chapters/:chapterId", async (c) =>
  (await store.deleteChapter(c.req.param("workId"), c.req.param("chapterId")), c.body(null, 204)));
app.get("/api/works/:workId/chapters/:chapterId/snapshots", async (c) =>
  c.json(await store.listSnapshots(c.req.param("workId"), c.req.param("chapterId"))));
app.get("/api/works/:workId/chapters/:chapterId/snapshots/:snapshotId", async (c) =>
  c.json(await store.getSnapshot(c.req.param("workId"), c.req.param("chapterId"), c.req.param("snapshotId"))));
app.get("/api/works/:workId/chapters/:chapterId/chat", async (c) => // 예전 경로
  c.json(await store.readChat(c.req.param("workId"), { type: "chapter", chapterId: checkId(c.req.param("chapterId")) })));
app.get("/api/works/:workId/chat", async (c) =>
  c.json(await store.readChat(c.req.param("workId"), store.parseTarget(c.req.query("target")))));

app.get("/api/works/:workId/notes", async (c) => c.json(await store.listNotes(c.req.param("workId"))));
app.patch("/api/works/:workId/notes", async (c) =>
  c.json(await store.reorderNotes(c.req.param("workId"), (await readBody(c.req.raw)).order)));
app.post("/api/works/:workId/notes", async (c) => c.json(await store.createNote(c.req.param("workId"), await readBody(c.req.raw))));
app.get("/api/works/:workId/notes/:noteId", async (c) => c.json(await store.getNote(c.req.param("workId"), c.req.param("noteId"))));
app.put("/api/works/:workId/notes/:noteId", async (c) => {
  const b = await readBody(c.req.raw);
  return c.json(await store.putNote(c.req.param("workId"), c.req.param("noteId"), str(b.text, 400_000), str(b.baseUpdatedAt, 50)));
});
app.patch("/api/works/:workId/notes/:noteId", async (c) =>
  c.json(await store.patchNote(c.req.param("workId"), c.req.param("noteId"), await readBody(c.req.raw))));
app.delete("/api/works/:workId/notes/:noteId", async (c) =>
  (await store.deleteNote(c.req.param("workId"), c.req.param("noteId")), c.body(null, 204)));
app.post("/api/works/:workId/notes/:noteId/split", async (c) =>
  c.json(await store.splitNoteById(c.req.param("workId"), c.req.param("noteId"))));

app.all("/api/*", () => fail(404, "not_found", "찾을 수 없어요."));

// 운영: 빌드된 클라이언트를 같이 서빙한다 (개발에서는 vite가 /api를 프록시).
if (process.env.NODE_ENV === "production") {
  const root = relative(process.cwd(), resolve(import.meta.dirname, "../dist"));
  app.use("*", serveStatic({ root }));
  app.get("*", serveStatic({ root, path: "index.html" })); // SPA 폴백
}

const port = Number(process.env.PORT ?? 8310);
serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, () => console.log(`pildam http://127.0.0.1:${port}  data=${store.dataDir}`));
