import type { ApiError } from "../../shared/types";

export class ApiRequestError extends Error {
  code: ApiError["error"] | "network" | "unknown";
  status: number;
  constructor(code: ApiRequestError["code"], message: string, status = 0) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }
}

const NETWORK_MSG = "서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.";

async function toError(res: Response): Promise<ApiRequestError> {
  let body: Partial<ApiError> = {};
  try {
    body = await res.json();
  } catch {
    /* 본문이 JSON이 아님 */
  }
  if (res.status === 401 && location.pathname !== "/login" && body.error !== "invalid_credentials") {
    location.assign("/login");
  }
  return new ApiRequestError(body.error ?? "unknown", body.message ?? "문제가 생겼어요. 다시 해 주세요.", res.status);
}

async function send(method: string, url: string, body: unknown, signal?: AbortSignal) {
  try {
    return await fetch(url, {
      method,
      signal,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiRequestError("network", NETWORK_MSG);
  }
}

async function request<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await send(method, url, body, signal);
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(url: string, signal?: AbortSignal) => request<T>("GET", url, undefined, signal),
  post: <T>(url: string, body?: unknown, signal?: AbortSignal) => request<T>("POST", url, body ?? {}, signal),
  put: <T>(url: string, body: unknown, signal?: AbortSignal) => request<T>("PUT", url, body, signal),
  patch: <T>(url: string, body: unknown, signal?: AbortSignal) => request<T>("PATCH", url, body, signal),
  delete: <T = void>(url: string, signal?: AbortSignal) => request<T>("DELETE", url, undefined, signal),
};

/** POST 후 NDJSON 응답을 한 줄씩 onEvent로 넘긴다. abort 시 AbortError를 던진다. */
export async function streamNdjson<T = import("../../shared/types").StreamEvent>(
  url: string,
  body: unknown,
  onEvent: (event: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await send("POST", url, body, signal);
  if (!res.ok) throw await toError(res);
  if (!res.body) throw new ApiRequestError("unknown", "응답을 받지 못했어요.");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  const flush = (line: string) => {
    if (line.trim()) onEvent(JSON.parse(line) as T);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      flush(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  }
  flush(buf);
}
