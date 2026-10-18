import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { ChapterMeta, Graph } from "../../../shared/types";
import { NodeDetail } from "./NodeDetail";

const meta: Meta<typeof NodeDetail> = { title: "Graph/NodeDetail", component: NodeDetail, parameters: { layout: "padded" } };
export default meta;

const chapters: ChapterMeta[] = ["c1", "c2", "c3"].map((id, i) => ({ id, title: `${i + 1}화`, updatedAt: "2026-01-10T09:00:00.000Z", hasSummary: true }));
const GRAPH: Graph = {
  updatedAt: "2026-01-20T09:00:00.000Z",
  nodes: [
    { id: "n1", name: "서윤", kind: "character", description: "극장 단골. 말수가 적다." },
    { id: "n2", name: "도현", kind: "character", description: "서윤의 옛 연인. 영사기사." },
    { id: "n3", name: "하늘 극장", kind: "place", description: "항구 도시의 낡은 극장." },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2", label: "연인", fromChapterId: null, toChapterId: "c1" },
    { id: "e2", source: "n1", target: "n2", label: "재회", fromChapterId: "c2", toChapterId: null },
    { id: "e3", source: "n2", target: "n3", label: "일터", fromChapterId: null, toChapterId: null },
  ],
};

function Live({ nodeId, current }: { nodeId: string; current: string | null }) {
  const [g, setG] = useState(GRAPH);
  const node = g.nodes.find((n) => n.id === nodeId)!;
  return (
    <div className="mx-auto max-w-sm bg-bg p-4">
      <NodeDetail graph={g} node={node} chapters={chapters} currentChapterId={current} edit={(fn) => setG(fn)} onAskDelete={() => {}} />
    </div>
  );
}
export const CharacterWithRelations: StoryObj = { render: () => <Live nodeId="n1" current="c3" /> };
export const PlaceAllChapters: StoryObj = { render: () => <Live nodeId="n3" current={null} /> };
