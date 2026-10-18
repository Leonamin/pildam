import type { Meta, StoryObj } from "@storybook/react-vite";
import type { GraphSuggestion } from "../../../shared/types";
import { WORK } from "../../../.storybook/fixtures";
import { SuggestionList } from "./SuggestionList";

// [반영]은 목 서버(.storybook/mock.ts)의 GET/PUT /graph가 받는다.
const meta: Meta<typeof SuggestionList> = {
  title: "Graph/SuggestionList",
  component: SuggestionList,
  parameters: { layout: "padded" },
  decorators: [(S) => <div className="mx-auto flex max-w-sm flex-col gap-2 bg-bg p-4"><S /></div>],
};
export default meta;
type S = StoryObj<typeof SuggestionList>;

const base = { workId: "w1", chapters: WORK.chapters };
const all: GraphSuggestion[] = [
  { type: "add-node", node: { name: "필름 상자", kind: "item", description: "극장 지하에 숨겨진 상자" } },
  { type: "update-node", name: "서윤", node: { name: "윤서", description: "극장 단골. 새벽회를 쫓는다." } },
  { type: "remove-node", name: "새벽회" },
  { type: "add-edge", sourceName: "도현", targetName: "새벽회", label: "협력", fromChapterId: "c3" },
  { type: "end-edge", sourceName: "서윤", targetName: "도현", label: "재회", toChapterId: "c3" },
  { type: "remove-edge", sourceName: "서윤", targetName: "새벽회", label: "적대" },
];
/** 모든 종류. 챕터 라벨(2화부터·3화까지)이 붙는다. */
export const AllKinds: S = { args: { ...base, suggestions: all } };
export const Single: S = { args: { ...base, suggestions: all.slice(1, 2) } };
