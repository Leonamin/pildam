// 서버·클라이언트 공용 API 계약. 바꿀 때는 양쪽을 함께 고친다.
// 시각은 모두 ISO 문자열. 오류 응답은 항상 ApiError 형태다.

export type ApiError = {
  error:
    | "unauthorized"
    | "invalid_credentials"
    | "too_many_attempts"
    | "not_found"
    | "bad_request"
    | "conflict" // 저장 기준 시각(baseUpdatedAt)이 서버와 다름
    | "ai_unavailable" // 한도 초과·로그인 만료 등 모델을 지금 쓸 수 없음
    | "ai_failed"
    | "ai_busy"; // 동시 실행 한도
  message: string; // 사용자에게 그대로 보여 줄 한국어 문장
};

// ── 인증 ── POST /api/login {username,password} → Me (세션 쿠키) · POST /api/logout · GET /api/me
export type Me = { username: string };

// ── AI 모델 ── GET /api/models → ModelOption[]
export type Provider = "agy" | "claude" | "codex" | "mock";
export type ModelOption = {
  id: string; // `${provider}:${model}`
  provider: Provider;
  model: string; // 모델 원문
  alias?: string;
  label: string; // alias 있으면 `${alias} (${model})`, 없으면 model
};

// ── 작품 ──
// GET /api/works → WorkSummary[] (updatedAt 내림차순)
// POST /api/works {title} → Work
// GET /api/works/:workId → Work
// PATCH /api/works/:workId {title?, modelId?, chapterOrder?: string[]} → Work
// DELETE /api/works/:workId
export type WorkSummary = { id: string; title: string; updatedAt: string; chapterCount: number };
export type ChapterMeta = { id: string; title: string; updatedAt: string; hasSummary: boolean };
export type Work = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  modelId: string; // 이 작품에서 마지막으로 고른 AI
  chapters: ChapterMeta[]; // 이 배열 순서가 곧 "화" 순서 (1화 = index 0)
};

// ── 설정 문서 ── GET/PUT /api/works/:workId/docs/:name
// PUT {text, baseUpdatedAt} → {updatedAt} | 409 conflict
export type DocName = "world" | "style" | "notes";
export type TextDoc = { text: string; updatedAt: string };

// ── 화(챕터) ──
// POST   /api/works/:workId/chapters {title} → ChapterMeta
// GET    /api/works/:workId/chapters/:chapterId → Chapter
// PUT    /api/works/:workId/chapters/:chapterId {text, baseUpdatedAt, snapshot?: SnapshotReason} → {updatedAt} | 409
//        snapshot이 있으면 덮어쓰기 전에 기존 본문을 스냅샷으로 남긴다 (AI 결과 적용 직전).
// PATCH  /api/works/:workId/chapters/:chapterId {title} → ChapterMeta
// DELETE /api/works/:workId/chapters/:chapterId
// GET    /api/works/:workId/chapters/:chapterId/snapshots → SnapshotMeta[] (최신순, 최대 50개 보관)
// GET    /api/works/:workId/chapters/:chapterId/snapshots/:snapshotId → {text}
// GET    /api/works/:workId/chapters/:chapterId/chat → ChatEntry[] (오래된 순)
// 본문은 일반 텍스트. 문단은 빈 줄("\n\n")로 구분한다.
export type Chapter = { meta: ChapterMeta; text: string; updatedAt: string; summary: string | null };
export type SnapshotReason = "ai-write" | "ai-rewrite" | "restore" | "manual";
export type SnapshotMeta = { id: string; createdAt: string; reason: SnapshotReason; preview: string };
export type ChatEntry = {
  id: string;
  at: string;
  kind: "write" | "revise" | "rewrite" | "summarize";
  instruction: string; // 사용자가 입력한 요청 (rewrite는 액션 이름 또는 직접 요청)
  modelId: string;
  resultPreview: string; // 결과 앞부분 (UI 기록용)
};

// ── 관계도 ── GET/PUT /api/works/:workId/graph  (PUT {graph, baseUpdatedAt} → {updatedAt} | 409)
export type NodeKind = "character" | "place" | "faction" | "item";
export type GraphNode = { id: string; name: string; kind: NodeKind; description: string };
export type GraphEdge = {
  id: string;
  source: string; // node id
  target: string;
  label: string; // "연인", "적" …
  fromChapterId: string | null; // null = 처음부터
  toChapterId: string | null; // null = 끝까지 (포함 구간)
};
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[]; updatedAt: string };

// 관계도·설정 반영 제안 (요약·온보딩 결과). 사용자가 [반영]을 눌러야 저장된다.
export type GraphSuggestion =
  | { type: "add-node"; node: Omit<GraphNode, "id"> }
  | { type: "add-edge"; sourceName: string; targetName: string; label: string; fromChapterId: string | null }
  | { type: "end-edge"; sourceName: string; targetName: string; label: string; toChapterId: string };

// ── AI ── (모두 POST, 본문의 manuscript는 클라이언트의 현재 원고: 저장 전 내용 포함)
//
// /api/works/:workId/ai/write  WriteRequest → NDJSON 스트림 (StreamEvent 한 줄씩)
//   mode "continue": 원고 끝에 이어 쓸 새 글을 만든다.
//   mode "revise": reviseTarget(AI가 마지막으로 쓴 덩어리, 사용자 수정 반영본)을 instruction대로 다시 쓴 전체 대체 글을 만든다.
// /api/works/:workId/ai/rewrite RewriteRequest → RewriteResponse (후보 3개)
// /api/works/:workId/ai/summarize {chapterId, modelId} → SummarizeResponse (요약은 서버가 저장)
// /api/works/:workId/ai/onboard {answers, modelId} → OnboardResponse (저장하지 않음, 사용자가 반영)
// 클라이언트가 요청을 abort하면 서버는 CLI 프로세스를 종료한다.
export type WriteRequest = {
  chapterId: string;
  modelId: string;
  instruction: string;
  mode: "continue" | "revise";
  manuscript: string;
  reviseTarget?: string;
};
export type StreamEvent =
  | { t: "delta"; text: string }
  | { t: "done" }
  | { t: "error"; error: ApiError["error"]; message: string };

export type RewriteAction = "rewrite" | "continue" | "describe" | "custom";
export type RewriteRequest = {
  chapterId: string;
  modelId: string;
  manuscript: string;
  selection: { text: string; start: number; end: number }; // manuscript 기준 문자 위치
  action: RewriteAction;
  instruction?: string; // action "custom"일 때 필수
};
export type RewriteResponse = { candidates: string[] };

export type SummarizeResponse = { summary: string; suggestions: GraphSuggestion[] };
export type OnboardResponse = { title: string; world: string; style: string; suggestions: GraphSuggestion[] };
