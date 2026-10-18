import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { PanelDock, type PanelKey } from "./PanelDock";

const meta: Meta<typeof PanelDock> = { title: "Editor/PanelDock", component: PanelDock, parameters: { layout: "centered" } };
export default meta;

function Stateful({ initial }: { initial: Record<PanelKey, boolean> }) {
  const [p, setP] = useState(initial);
  return <div className="h-40 w-[420px]"><PanelDock pressed={p} onToggle={(k) => setP((x) => ({ ...x, [k]: !x[k] }))} /></div>;
}
export const AllOn: StoryObj = { render: () => <Stateful initial={{ outline: true, manuscript: true, ai: true }} /> };
export const AiOnly: StoryObj = { render: () => <Stateful initial={{ outline: false, manuscript: false, ai: true }} /> };
export const AllOff: StoryObj = { render: () => <Stateful initial={{ outline: false, manuscript: false, ai: false }} /> };
