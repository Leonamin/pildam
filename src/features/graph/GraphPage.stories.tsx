import type { Meta, StoryObj } from "@storybook/react-vite";
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
