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
export const WorldDoc: S = { parameters: at("/works/w1?doc=world") };
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
