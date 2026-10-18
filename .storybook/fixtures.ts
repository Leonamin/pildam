// 고정 픽스처. 날짜·ID는 항상 같은 값이라 스토리가 매번 같은 화면을 만든다.
import type { Chapter, ChatEntry, Graph, ModelOption, SnapshotMeta, SummarizeResponse, Work, WorkSummary, OnboardResponse } from "../shared/types";

export const ME = { username: "yuna" };
export const WORK_ID = "w1";
export const CH = { c1: "c1", c2: "c2", c3: "c3" } as const;

export const MODELS: ModelOption[] = [
  { id: "claude:opus", provider: "claude", model: "opus", alias: "작가", label: "작가 (opus)" },
  { id: "mock:mock", provider: "mock", model: "mock", label: "mock" },
];

export const WORK: Work = {
  id: WORK_ID,
  title: "비 오는 날의 극장",
  createdAt: "2026-01-02T09:00:00.000Z",
  updatedAt: "2026-01-20T09:00:00.000Z",
  modelId: "claude:opus",
  chapters: [
    { id: CH.c1, title: "첫 만남", updatedAt: "2026-01-03T09:00:00.000Z", hasSummary: true },
    { id: CH.c2, title: "우산 하나", updatedAt: "2026-01-10T09:00:00.000Z", hasSummary: true },
    { id: CH.c3, title: "닫힌 극장", updatedAt: "2026-01-20T09:00:00.000Z", hasSummary: false },
  ],
};
export const EMPTY_WORK: Work = { ...WORK, id: "w-empty", title: "빈 작품", chapters: [] };

export const WORKS: WorkSummary[] = [
  { id: WORK_ID, title: WORK.title, updatedAt: WORK.updatedAt, chapterCount: 3 },
  { id: "w2", title: "달의 정원", updatedAt: "2026-01-12T09:00:00.000Z", chapterCount: 12 },
  { id: "w3", title: "제목 없는 이야기", updatedAt: "2026-01-05T09:00:00.000Z", chapterCount: 0 },
];

export const CHAPTER_TEXT: Record<string, string> = {
  c1: "비가 내리던 저녁, 서윤은 오래된 극장 앞에서 걸음을 멈췄다.\n\n간판의 불은 반쯤 나가 있었다. 안에서 누군가 필름을 감는 소리가 희미하게 들렸다.",
  c2: "도현은 우산 하나를 서윤 쪽으로 기울였다. 말없이 걷는 동안 빗소리만 둘 사이를 채웠다.\n\n\"아직도 그 극장에 가?\"\n\n서윤은 대답 대신 웃었다.",
  c3: "극장 문에는 '당분간 쉽니다'라는 쪽지가 붙어 있었다.\n\n서윤은 쪽지를 오래 들여다보았다. 새벽회의 인장이 구석에 찍혀 있었다.",
};

export const DOCS = {
  world: "비가 잦은 항구 도시. 오래된 극장 '하늘 극장'을 중심으로 이야기가 흐른다.",
  style: "담담하고 짧은 문장. 대화는 큰따옴표.",
  notes: "",
};

export const chapterOf = (id: string): Chapter => {
  const meta = WORK.chapters.find((c) => c.id === id)!;
  return { meta, text: CHAPTER_TEXT[id] ?? "", updatedAt: meta.updatedAt, summary: meta.hasSummary ? "서윤이 극장 앞에서 도현을 만난다." : null };
};

export const GRAPH: Graph = {
  updatedAt: "2026-01-20T09:00:00.000Z",
  nodes: [
    { id: "n1", name: "서윤", kind: "character", description: "극장 단골. 말수가 적다." },
    { id: "n2", name: "도현", kind: "character", description: "서윤의 옛 연인. 영사기사." },
    { id: "n3", name: "하늘 극장", kind: "place", description: "항구 도시의 낡은 극장." },
    { id: "n4", name: "새벽회", kind: "faction", description: "극장을 사들이려는 모임." },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2", label: "연인", fromChapterId: null, toChapterId: CH.c1 },
    { id: "e2", source: "n1", target: "n2", label: "재회", fromChapterId: CH.c2, toChapterId: null },
    { id: "e3", source: "n2", target: "n3", label: "일터", fromChapterId: null, toChapterId: null },
    { id: "e4", source: "n4", target: "n3", label: "인수 시도", fromChapterId: CH.c3, toChapterId: null },
    { id: "e5", source: "n1", target: "n4", label: "적대", fromChapterId: CH.c3, toChapterId: null },
  ],
};
export const EMPTY_GRAPH: Graph = { updatedAt: "2026-01-02T09:00:00.000Z", nodes: [], edges: [] };

export const CHAT: ChatEntry[] = [
  { id: "m1", at: "2026-01-10T09:00:00.000Z", kind: "write", instruction: "우산을 같이 쓰는 장면", modelId: "claude:opus", resultPreview: "도현은 우산 하나를 서윤 쪽으로 기울였다." },
];
export const SNAPSHOTS: SnapshotMeta[] = [
  { id: "s1", createdAt: "2026-01-10T08:00:00.000Z", reason: "ai-write", preview: "비가 내리던 저녁…" },
];

export const SUMMARIZE: SummarizeResponse = {
  summary: "서윤은 닫힌 극장 앞에서 새벽회의 인장을 발견한다.",
  suggestions: [
    { type: "add-node", node: { name: "필름 상자", kind: "item", description: "극장 지하에 숨겨진 상자" } },
    { type: "add-edge", sourceName: "서윤", targetName: "새벽회", label: "추적", fromChapterId: CH.c3 },
    { type: "end-edge", sourceName: "서윤", targetName: "도현", label: "재회", toChapterId: CH.c3 },
  ],
};

export const ONBOARD: OnboardResponse = {
  title: "비 오는 날의 극장",
  world: DOCS.world,
  style: DOCS.style,
  suggestions: [
    { type: "add-node", node: { name: "서윤", kind: "character", description: "극장 단골" } },
    { type: "add-edge", sourceName: "서윤", targetName: "도현", label: "옛 연인", fromChapterId: null },
  ],
};

export const AI_DELTAS = ["서윤은 쪽지를 접어 ", "주머니에 넣었다. ", "빗줄기가 ", "더 굵어지고 있었다."];
