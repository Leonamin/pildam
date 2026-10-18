import type { Meta, StoryObj } from "@storybook/react-vite";
import type { GraphSuggestion } from "../../../shared/types";
import { SummaryCards } from "./Summary";

// 목 서버(.storybook/mock.ts)의 GET/PUT /graph가 [반영]에 답한다.
const meta: Meta<typeof SummaryCards> = {
  title: "Editor/Summary",
  component: SummaryCards,
  parameters: { layout: "padded" },
  decorators: [(S) => <div className="mx-auto max-w-sm bg-bg p-4"><S /></div>],
};
export default meta;
type S = StoryObj<typeof SummaryCards>;

const suggestions: GraphSuggestion[] = [
  { type: "add-node", node: { name: "필름 상자", kind: "item", description: "극장 지하에 숨겨진 상자" } },
  { type: "add-edge", sourceName: "서윤", targetName: "새벽회", label: "추적", fromChapterId: "c3" },
  { type: "end-edge", sourceName: "서윤", targetName: "도현", label: "재회", toChapterId: "c3" },
];
const summary = "서윤은 닫힌 극장 앞에서 새벽회의 인장을 발견한다.";
const base = { workId: "w1", onClose: () => {} };

export const WithSuggestions: S = { args: { ...base, result: { chapterLabel: "3화", summary, suggestions } } };
export const SummaryOnly: S = { args: { ...base, result: { chapterLabel: "3화", summary, suggestions: [] } } };
