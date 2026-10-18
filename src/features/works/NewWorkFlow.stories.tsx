import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { NewWorkFlow } from "./NewWorkFlow";

// 홈에서 [새 작품]을 눌러 연 상태를 play로 재현한다(클릭만 필요한 상태).
const screen = () => within(document.body); // 다이얼로그·서랍은 body로 포털됨

const meta: Meta<typeof NewWorkFlow> = {
  title: "Works/NewWorkFlow",
  component: NewWorkFlow,
  parameters: { pildam: { route: "/" } },
};
export default meta;
type S = StoryObj<typeof NewWorkFlow>;

async function openToStep3() {
  const ui = screen();
  await userEvent.click(await ui.findByRole("button", { name: /새 작품/ }));
  await userEvent.type(await ui.findByLabelText("어떤 이야기를 쓰고 싶어요?"), "비 오는 날 옛 연인을 만나는 이야기");
  await userEvent.click(await ui.findByRole("button", { name: "다음" }));
  await ui.findByText("주인공은 누구예요?");
  await userEvent.click(await ui.findByRole("button", { name: "다음" }));
  await ui.findByText("어떤 느낌의 글이면 좋겠어요?");
}

export const Step1: S = {
  play: async () => {
    await userEvent.click(await screen().findByRole("button", { name: /새 작품/ }));
    await screen().findByText("어떤 이야기를 쓰고 싶어요?");
  },
};
export const Step3: S = { play: openToStep3 };

export const Review: S = {
  play: async () => {
    await openToStep3();
    await userEvent.click(await screen().findByRole("button", { name: "AI에게 초안 받기" }));
    await screen().findByText("AI가 정리한 초안이에요. 마음에 안 드는 곳은 고쳐 쓰세요.");
  },
};

export const AiError: S = {
  parameters: { pildam: { route: "/", mock: { onboard: "error" } } },
  play: async () => {
    await openToStep3();
    await userEvent.click(await screen().findByRole("button", { name: "AI에게 초안 받기" }));
    await screen().findByText("초안을 받지 못했어요");
  },
};

export const MobileStep1: S = {
  globals: { viewport: { value: "mobile2", isRotated: false } },
  play: Step1.play,
};
