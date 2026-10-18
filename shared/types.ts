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

// ── 문체 ── GET/PUT /api/works/:workId/docs/style
// PUT {text, baseUpdatedAt} → {updatedAt} | 409 conflict
// (세계관·메모는 설정 노트로 옮겨졌다. 예전 world.txt / notes.txt는 서버가 처음 읽을 때 노트로 이관한다.)
export type DocName = "style";
export type TextDoc = { text: string; updatedAt: string };

// ── 설정 노트 ── 세계관·인물·메모 등 자유롭게 나누는 노트. 깊이는 폴더 → 노트 2단계까지.
// GET    /api/works/:workId/notes → NoteMeta[] (표시 순서)
// PATCH  /api/works/:workId/notes {order: string[]} → NoteMeta[]
// POST   /api/works/:workId/notes {title, folder, text?} → NoteMeta
// GET    /api/works/:workId/notes/:noteId → Note
// PUT    /api/works/:workId/notes/:noteId {text, baseUpdatedAt} → {updatedAt} | 409
// PATCH  /api/works/:workId/notes/:noteId {title?, folder?, pinned?} → NoteMeta
// DELETE /api/works/:workId/notes/:noteId
// POST   /api/works/:workId/notes/:noteId/split → NoteMeta[] (전체 목록)
//        제목줄 기준으로 쪼갠다. 원래 노트는 첫 조각이 되고 나머지는 같은 폴더에 바로 뒤로 들어간다. 나눌 제목이 없으면 400.
// folder는 폴더 이름("" = 폴더 없음). 폴더 안에 폴더는 없다. 폴더는 노트가 있을 때만 존재한다.
export type NoteMeta = {
  id: string;
  title: string;
  folder: string;
  pinned: boolean; // true면 AI 호출마다 항상 본문을 보낸다
  recap: string; // 한 줄 요약 (서버가 저장 때 본문 앞부분에서 만든다)
  size: number; // 글자 수
  updatedAt: string;
};
export type Note = { meta: NoteMeta; text: string; updatedAt: string };

// ── 화(챕터) ──
// POST   /api/works/:workId/chapters {title} → ChapterMeta
// GET    /api/works/:workId/chapters/:chapterId → Chapter
// PUT    /api/works/:workId/chapters/:chapterId {text, baseUpdatedAt, snapshot?: SnapshotReason} → {updatedAt} | 409
//        snapshot이 있으면 덮어쓰기 전에 기존 본문을 스냅샷으로 남긴다 (AI 결과 적용 직전).
// PATCH  /api/works/:workId/chapters/:chapterId {title} → ChapterMeta
// DELETE /api/works/:workId/chapters/:chapterId
// GET    /api/works/:workId/chapters/:chapterId/snapshots → SnapshotMeta[] (최신순, 최대 50개 보관)
// GET    /api/works/:workId/chapters/:chapterId/snapshots/:snapshotId → {text}
// GET    /api/works/:workId/chat?target=<AiTargetKey> → ChatEntry[] (오래된 순)
// 본문은 일반 텍스트. 문단은 빈 줄("\n\n")로 구분한다.
export type Chapter = { meta: ChapterMeta; text: string; updatedAt: string; summary: string | null };
export type SnapshotReason = "ai-write" | "ai-rewrite" | "restore" | "manual";
export type SnapshotMeta = { id: string; createdAt: string; reason: SnapshotReason; preview: string };
// AI 패널이 지금 다루는 대상. 지시 기록은 대상마다 따로 쌓인다.
export type AiTarget =
  | { type: "chapter"; chapterId: string }
  | { type: "style" }
  | { type: "note"; noteId: string }
  | { type: "graph" };
// 쿼리·파일 이름용 키: "chapter:<id>" | "style" | "note:<id>" | "graph"
export type AiTargetKey = string;
export const targetKey = (t: AiTarget): AiTargetKey =>
  t.type === "chapter" ? `chapter:${t.chapterId}` : t.type === "note" ? `note:${t.noteId}` : t.type;

export type ChatEntry = {
  id: string;
  at: string;
  kind: "write" | "revise" | "rewrite" | "summarize" | "edit" | "graph";
  instruction: string; // 사용자가 입력한 요청 (rewrite는 액션 이름 또는 직접 요청)
  modelId: string;
  resultPreview: string; // 결과 앞부분 (UI 기록용)
  usedNotes?: string[]; // AI가 참고한 노트 제목 ("폴더 › 제목")
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

// 관계도 반영 제안 (요약·온보딩·관계도 채팅 결과). 사용자가 [반영]을 눌러야 저장된다. 노드는 이름으로 가리킨다.
export type GraphSuggestion =
  | { type: "add-node"; node: Omit<GraphNode, "id"> }
  | { type: "update-node"; name: string; node: Partial<Omit<GraphNode, "id">> } // 바꿀 필드만 (이름 변경 포함)
  | { type: "remove-node"; name: string } // 연결된 관계도 함께 지운다
  | { type: "add-edge"; sourceName: string; targetName: string; label: string; fromChapterId: string | null }
  | { type: "end-edge"; sourceName: string; targetName: string; label: string; toChapterId: string }
  | { type: "remove-edge"; sourceName: string; targetName: string; label: string };

// ── AI ── (모두 POST, 본문의 manuscript는 클라이언트의 현재 원고: 저장 전 내용 포함)
//
// /api/works/:workId/ai/write  WriteRequest → NDJSON 스트림 (StreamEvent 한 줄씩)
//   mode "continue": 원고 끝에 이어 쓸 새 글을 만든다.
//   mode "revise": reviseTarget(AI가 마지막으로 쓴 덩어리, 사용자 수정 반영본)을 instruction대로 다시 쓴 전체 대체 글을 만든다.
// /api/works/:workId/ai/rewrite RewriteRequest → RewriteResponse (후보 3개, 화·문체·노트 모두)
// /api/works/:workId/ai/edit-doc EditDocRequest → EditDocResponse (문체·노트 전체를 요청대로 고친 새 본문, 저장하지 않음)
// /api/works/:workId/ai/edit-graph EditGraphRequest → EditGraphResponse (관계도 채팅: 답 + 제안, 저장하지 않음)
//
// 설정 노트 고르기: 모든 AI 호출에 노트 목록(제목·한 줄 요약)은 항상 들어간다. 본문은 서버가 고른다.
//   노트 전체가 작으면 전부, 크면 pinned + 사용자가 붙인 noteIds + AI가 목록을 보고 고른 노트(실패 시 낱말 일치)를 분량 안에서.
//   고른 결과는 스트림의 {t:"notes"} 이벤트나 응답의 usedNotes로 알려 준다.
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
  noteIds?: string[]; // 사용자가 직접 붙인 노트
};
export type StreamEvent =
  | { t: "notes"; titles: string[] } // 맨 처음 한 번: 참고한 노트
  | { t: "delta"; text: string }
  | { t: "done" }
  | { t: "error"; error: ApiError["error"]; message: string };

export type RewriteAction = "rewrite" | "continue" | "describe" | "custom";
export type RewriteRequest = {
  target: Exclude<AiTarget, { type: "graph" }>;
  modelId: string;
  manuscript: string; // 대상의 현재 본문
  selection: { text: string; start: number; end: number }; // manuscript 기준 문자 위치
  action: RewriteAction;
  instruction?: string; // action "custom"일 때 필수
  noteIds?: string[];
};
export type RewriteResponse = { candidates: string[]; usedNotes: string[] };

export type EditDocRequest = {
  target: { type: "style" } | { type: "note"; noteId: string };
  modelId: string;
  instruction: string;
  text: string; // 현재 본문 (저장 전 내용 포함)
  noteIds?: string[];
};
export type EditDocResponse = { text: string; usedNotes: string[] };

export type EditGraphRequest = {
  modelId: string;
  instruction: string;
  chapterId: string | null; // 관계도 슬라이더의 현재 화 (null = 전체)
  noteIds?: string[];
};
// 제안의 fromChapterId/toChapterId는 서버가 AI의 "N화"를 화 ID로 바꿔 채운다.
export type EditGraphResponse = { reply: string; suggestions: GraphSuggestion[]; usedNotes: string[] };

export type SummarizeResponse = { summary: string; suggestions: GraphSuggestion[]; usedNotes: string[] };
export type OnboardResponse = { title: string; world: string; style: string; suggestions: GraphSuggestion[] };
