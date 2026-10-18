// 아이디·비밀번호 로그인, 쿠키 세션, 로그인 실패 제한.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Me } from "../shared/types.ts";
import { dataDir, fail, readBody, str, writeAtomic } from "./store.ts";

const COOKIE = "pildam_session";
const DAY = 86_400_000;
const SESSION_MS = 30 * DAY;

type User = { username: string; passwordHash: string };
const usersFile = `${dataDir}/users.json`;
const sessionsFile = `${dataDir}/sessions.json`;

const kdf = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((ok, no) => scrypt(pw, salt, 64, (e, k) => (e ? no(e) : ok(k))));

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

// 형식: scrypt$<salt hex>$<hash hex>
async function verify(pw: string, stored: string): Promise<boolean> {
  const [, salt, hash] = stored.split("$");
  const want = Buffer.from(hash ?? "", "hex");
  const got = await kdf(pw, Buffer.from(salt ?? "", "hex"));
  return want.length === got.length && timingSafeEqual(want, got);
}
// add-user 스크립트에서 쓴다.
export async function upsertUser(username: string, password: string) {
  const salt = randomBytes(16);
  const passwordHash = `scrypt$${salt.toString("hex")}$${(await kdf(password, salt)).toString("hex")}`;
  const users = (await readJson<User[]>(usersFile, [])).filter((u) => u.username !== username);
  await mkdir(dataDir, { recursive: true });
  await writeAtomic(usersFile, JSON.stringify([...users, { username, passwordHash }], null, 2));
}

// ── 세션: 토큰 해시 → {username, expires}. 재시작해도 유지되도록 파일에도 쓴다. ──
type Session = { username: string; expires: number };
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const sessions = new Map<string, Session>(Object.entries(await readJson<Record<string, Session>>(sessionsFile, {})));
const persist = () => {
  for (const [k, s] of sessions) if (s.expires < Date.now()) sessions.delete(k);
  return writeAtomic(sessionsFile, JSON.stringify(Object.fromEntries(sessions))).catch(console.error);
};

export function sessionUser(c: Context): string | undefined {
  const token = getCookie(c, COOKIE);
  const s = token ? sessions.get(sha(token)) : undefined;
  return s && s.expires > Date.now() ? s.username : undefined;
}

// ── 로그인 실패 제한: IP당 15분에 5번 ──
const failures = new Map<string, number[]>();
const WINDOW = 15 * 60_000;
const ip = (c: Context) => c.req.header("cf-connecting-ip") ?? getConnInfo(c).remote.address ?? "?";
const recent = (key: string) => (failures.get(key) ?? []).filter((t) => t > Date.now() - WINDOW);

export const auth = new Hono();

auth.post("/login", async (c) => {
  const key = ip(c);
  if (recent(key).length >= 5) fail(429, "too_many_attempts", "시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.");
  const b = await readBody(c.req.raw);
  const username = str(b.username, 100, 1);
  const password = str(b.password, 200, 1);
  const user = (await readJson<User[]>(usersFile, [])).find((u) => u.username === username);
  // 없는 아이디도 같은 시간이 걸리게 해시 계산은 한다.
  const ok = await verify(password, user?.passwordHash ?? "scrypt$00$00");
  if (!user || !ok) {
    failures.set(key, [...recent(key), Date.now()]);
    return fail(401, "invalid_credentials", "아이디나 비밀번호가 맞지 않아요.");
  }
  failures.delete(key);
  const token = randomBytes(32).toString("hex");
  sessions.set(sha(token), { username, expires: Date.now() + SESSION_MS });
  await persist();
  setCookie(c, COOKIE, token, {
    httpOnly: true, sameSite: "Lax", path: "/", maxAge: SESSION_MS / 1000,
    secure: c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:",
  });
  return c.json<Me>({ username });
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, COOKIE);
  if (token) sessions.delete(sha(token));
  await persist();
  deleteCookie(c, COOKIE, { path: "/" });
  return c.body(null, 204);
});

auth.get("/me", (c) => c.json<Me>({ username: sessionUser(c)! }));
