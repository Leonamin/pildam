import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { HomePage } from "./HomePage";

const screen = () => within(document.body); // 다이얼로그·서랍은 body로 포털됨

const meta: Meta<typeof HomePage> = {
  title: "Screens/Home",
  component: HomePage,
  parameters: { pildam: { route: "/" } },
};
export default meta;
type S = StoryObj<typeof HomePage>;

export const WithWorks: S = {};
export const Empty: S = { parameters: { pildam: { route: "/", mock: { works: [] } } } };
export const LoadError: S = { parameters: { pildam: { route: "/", mock: { works: "error" } } } };
export const Mobile: S = { globals: { viewport: { value: "mobile2", isRotated: false } } };

/** 새 작품 다이얼로그가 열린 홈. */
export const NewWorkDialogOpen: S = {
  play: async () => {
    await userEvent.click(await screen().findByRole("button", { name: /새 작품/ }));
    await screen().findByText("어떤 이야기를 쓰고 싶어요?");
  },
};
