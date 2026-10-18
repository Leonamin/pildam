import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { GraphPage } from "./GraphPage";

const meta: Meta<typeof GraphPage> = {
  title: "Screens/Graph",
  component: GraphPage,
  parameters: { pildam: { route: "/works/w1/graph" } },
};
export default meta;
type S = StoryObj<typeof GraphPage>;

/** 3화에 걸친 노드 4·관계 5. 기본은 마지막 화(3화) 시점. */
export const ThreeChapters: S = {};
export const Empty: S = { parameters: { pildam: { route: "/works/w1/graph", mock: { graph: "empty" } } } };
export const LoadError: S = { parameters: { pildam: { route: "/works/w1/graph", mock: { graphError: true } } } };
/** 좁은 화면은 캔버스 대신 목록 보기가 기본. */
export const MobileList: S = { globals: { viewport: { value: "mobile2", isRotated: false } } };

const screen = () => within(document.body);
const mobile = { viewport: { value: "mobile2", isRotated: false } };
const route = "/works/w1/graph";
async function askAi() {
  const ui = screen();
  await userEvent.type(await ui.findByPlaceholderText("관계도를 어떻게 바꿀까요?"), "서윤과 새벽회 관계를 정리해 줘");
  await userEvent.click(await ui.findByRole("button", { name: /AI에게 맡기기/ }));
  await ui.findByText("관계도에 반영할까요?");
}
/** AI 답 + 제안 카드(고치기·관계 지우기·관계 더하기) + 그림 위 강조. */
export const AiSuggestions: S = { play: askAi };
/** 좁은 화면: AI 탭으로 옮겨 같은 흐름. */
export const MobileAiPanel: S = {
  globals: mobile,
  play: async () => { await userEvent.click(await screen().findByRole("button", { name: "AI" })); await askAi(); },
};
/** 저장된 패널 상태: 관계도를 끄고 AI만 켠 모습. */
export const GraphPanelOff: S = { parameters: { pildam: { route, storage: { "pildam.graph.panels": JSON.stringify({ graph: false, ai: true }) } } } };
/** AI 패널을 끄고 관계도만. */
export const AiPanelOff: S = { parameters: { pildam: { route, storage: { "pildam.graph.panels": JSON.stringify({ graph: true, ai: false }) } } } };
/** 지시 기록에 관계도 대화와 참고한 노트가 보인다. */
export const AiHistory: S = { play: async () => { await screen().findByText(/참고한 노트/); } };
