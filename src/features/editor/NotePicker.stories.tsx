import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { NOTES } from "../../../.storybook/fixtures";
import { NoteChips, NotePicker } from "./ai/NotePicker";

const meta: Meta<typeof NotePicker> = { title: "Editor/NotePicker", component: NotePicker, parameters: { layout: "centered" } };
export default meta;

function Stateful({ initial = [] as string[], disabled = false }) {
  const [v, setV] = useState(initial);
  return (
    <div className="flex w-[360px] flex-col gap-2">
      <NoteChips notes={NOTES} value={v} onChange={setV} disabled={disabled} />
      <NotePicker notes={NOTES} value={v} onChange={setV} disabled={disabled} />
    </div>
  );
}
const open = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: /노트 붙이기/ }));
  await within(document.body).findByRole("checkbox", { name: "하늘 극장" });
};

/** 팝오버를 연 상태: 폴더별 묶음과 폴더 없는 노트("폴더 없음"). */
export const Open: StoryObj = { render: () => <Stateful initial={["nw1", "np1"]} />, play: open };
export const Closed: StoryObj = { render: () => <Stateful /> };
export const WithChips: StoryObj = { render: () => <Stateful initial={["nw1", "np1", "nm1"]} /> };
export const Disabled: StoryObj = { render: () => <Stateful initial={["nw1"]} disabled /> };
