import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { WorkspacePage } from "./WorkspacePage";

const screen = () => within(document.body); // 다이얼로그·서랍은 body로 포털됨

const meta: Meta<typeof WorkspacePage> = {
  title: "Screens/Workspace",
  component: WorkspacePage,
  parameters: { pildam: { route: "/works/w1?ch=c2" } },
};
export default meta;
type S = StoryObj<typeof WorkspacePage>;

const at = (route: string, extra: object = {}) => ({ pildam: { route, ...extra } });
const mobile = { viewport: { value: "mobile2", isRotated: false } };

export const Chapter2: S = {};
export const Chapter3NoSummaryOnPrevious: S = { parameters: at("/works/w1?ch=c3") };
export const StyleDoc: S = { parameters: at("/works/w1?doc=style") };
export const PanelsBothOff: S = { parameters: at("/works/w1?ch=c2", { storage: { "pildam.panels": JSON.stringify({ manuscript: false, ai: false }) } }) };
export const OutlineOnly: S = { parameters: at("/works/w1?ch=c2", { storage: { "pildam.panels": JSON.stringify({ outline: true, manuscript: false, ai: false }) } }) };
export const Mobile: S = { parameters: at("/works/w1?ch=c2"), globals: mobile };
export const Tablet: S = { globals: { viewport: { value: "tablet", isRotated: false } } };
export const NoChapters: S = { parameters: at("/works/w1", { mock: { work: "empty" } }) };
export const LoadError: S = { parameters: at("/works/w1", { mock: { workError: true } }) };

/** 원고가 뜬 뒤(에디터 준비) 장면을 입력해 [이어 쓰기]를 누른다. */
async function ask() {
  const ui = screen();
  await ui.findByText(/도현은 우산 하나를/);
  await userEvent.type(await ui.findByLabelText("어떤 장면을 쓸까요?"), "극장 문 앞 장면");
  await userEvent.click(await ui.findByRole("button", { name: /이어 쓰기/ }));
}

/** 목 /ai/write가 {"t":"error","error":"ai_unavailable"} 한 줄을 돌려준다. */
export const AiError: S = { parameters: at("/works/w1?ch=c3", { mock: { ai: "error" } }), play: async () => { await ask(); await screen().findByText(/AI를 지금은 쓸 수 없어요/); } };
/** 델타를 250ms 간격으로 흘리다 끝나지 않는다(스트리밍 중 상태 유지). */
export const AiStreaming: S = { parameters: at("/works/w1?ch=c3", { mock: { ai: "forever" } }), play: async () => { await ask(); await screen().findByText(/주머니에 넣었다/); await screen().findByRole("button", { name: /멈추기/ }); } };
/** 델타 후 done까지 정상 완료. */
export const AiWritten: S = { parameters: at("/works/w1?ch=c3", { mock: { ai: "stream", deltaDelayMs: 40 } }), play: async () => { await ask(); await screen().findByText(/더 굵어지고 있었다/); await screen().findByRole("button", { name: /이어 쓰기/ }); } };
/** 이전 화(2화)에 요약이 없으면 새 화 추가 뒤 정리 제안이 뜬다 — 여기서는 3화 AI 패널의 [이 화 정리하기] 결과. */
export const AiSummaryResult: S = { parameters: at("/works/w1?ch=c3"), play: async () => { await screen().findByText(/당분간 쉽니다/); await userEvent.click(await screen().findByRole("button", { name: /이 화 정리하기/ })); await screen().findByText("관계도에 반영할까요?"); } };

// ── 설정 노트 · 문서 고치기 ──
const note = (id: string, extra: object = {}) => at(`/works/w1?note=${id}`, extra);
/** 폴더 안 노트(세계관 › 하늘 극장, 고정됨)를 연 모습. */
export const NoteOpen: S = { parameters: note("nw1"), play: async () => { await screen().findAllByText(/비가 잦은 항구 도시/); } };
/** 목차: 인물 폴더만 접힘(pildam.folders.collapsed.w1). */
export const OutlineFolderCollapsed: S = { parameters: note("nw1", { storage: { "pildam.folders.collapsed.w1": JSON.stringify(["인물"]) } }) };
/** 폴더에 혼자 있고 3000자 넘는 노트: 글머리에 [제목별로 나누기] 안내가 뜬다. */
export const LongNoteSplitHint: S = { parameters: note("nlong"), play: async () => { await screen().findByRole("button", { name: /제목별로 나누기/ }); } };
/** 이전 주소 ?doc=world는 세계관 폴더 첫 노트로 넘어간다. */
export const LegacyWorldRedirect: S = { parameters: at("/works/w1?doc=world"), play: async () => { await screen().findAllByText(/비가 잦은 항구 도시/); } };

/** 문체에서 요청 → [AI에게 고치게 하기] → 문단별 비교(수정·삭제·추가)와 [적용][취소][다시] 바. */
export const StyleDocEditDiff: S = {
  parameters: at("/works/w1?doc=style"),
  play: async () => {
    const ui = screen();
    await ui.findAllByText(/담담하고 짧은 문장/);
    await userEvent.type(await ui.findByLabelText("어떻게 고칠까요?"), "문장을 더 짧게");
    await userEvent.click(await ui.findByRole("button", { name: /AI에게 고치게 하기/ }));
    await ui.findByRole("dialog", { name: "AI가 고친 내용" });
  },
};
/** 노트 붙이기 팝오버를 열고 두 개를 골라 칩으로 보여 준다. */
export const NotePickerChips: S = {
  parameters: at("/works/w1?ch=c2"),
  play: async () => {
    const ui = screen();
    await ui.findAllByText(/도현은 우산 하나를/);
    await userEvent.click(await ui.findByRole("button", { name: /노트 붙이기/ }));
    await userEvent.click(await ui.findByRole("checkbox", { name: "하늘 극장" }));
    await userEvent.click(await ui.findByRole("checkbox", { name: "서윤" }));
    await ui.findByRole("list", { name: "붙인 노트" });
  },
};
/** 지시 기록에 "참고한 노트:" 줄(눌러 그 노트로 이동)이 붙는다. */
export const HistoryUsedNotes: S = { parameters: at("/works/w1?ch=c2"), play: async () => { await screen().findByText(/참고한 노트/); } };
