import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { LoginPage } from "./LoginPage";

const screen = () => within(document.body); // 다이얼로그·서랍은 body로 포털됨

const meta: Meta<typeof LoginPage> = {
  title: "Auth/LoginPage",
  component: LoginPage,
  parameters: { pildam: { route: "/login", mock: { me: null } } },
};
export default meta;
type S = StoryObj<typeof LoginPage>;

export const Default: S = {};

/** 목 서버는 비밀번호가 pildam! 일 때만 통과한다. 틀린 값을 제출하면 invalid_credentials. */
export const WrongPassword: S = {
  play: async () => {
    const ui = screen();
    await userEvent.type(await ui.findByLabelText("아이디"), "yuna");
    await userEvent.type(await ui.findByLabelText("비밀번호"), "wrong");
    await userEvent.click(await ui.findByRole("button", { name: "들어가기" }));
    await ui.findByText("아이디나 비밀번호가 맞지 않아요.");
  },
};
