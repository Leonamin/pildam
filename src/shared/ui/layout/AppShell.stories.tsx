import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell } from "./AppShell";
import { workNav } from "../../../app/workNav";

const meta: Meta<typeof AppShell> = {
  title: "Layout/AppShell",
  component: AppShell,
  // 조각 스토리: 공급자(Toast·Router)는 전역 decorator가 씌운다. 현재 위치는 "/"라 홈이 활성.
};
export default meta;

export const Desktop: StoryObj<typeof AppShell> = {
  args: { items: workNav("w1"), children: <main className="p-6">본문 영역</main> },
};

export const Mobile: StoryObj<typeof AppShell> = {
  ...Desktop,
  globals: { viewport: { value: "mobile2", isRotated: false } },
};
