import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus } from "lucide-react";
import { Alert } from "./basic/alert";
import { Button, IconButton } from "./basic/button";
import { Spinner } from "./basic/spinner";

const meta: Meta = { title: "UI/Kit", parameters: { layout: "padded" } };
export default meta;

const Row = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-6"><h3 className="mb-2 text-sm text-muted">{title}</h3><div className="flex flex-wrap items-center gap-3">{children}</div></section>
);

/** 필담 테마로 보는 공용 부품: 변형·상태 한 장. */
export const Variants: StoryObj = {
  render: () => (
    <div className="bg-bg p-4 text-ink">
      <Row title="Button">
        <Button>기본</Button>
        <Button variant="secondary">보조</Button>
        <Button variant="danger">삭제</Button>
        <Button disabled>비활성</Button>
        <Button isLoading>저장 중</Button>
      </Row>
      <Row title="IconButton">
        <IconButton label="추가"><Plus size={16} aria-hidden="true" /></IconButton>
        <IconButton label="추가" appearance="filled"><Plus size={16} aria-hidden="true" /></IconButton>
        <IconButton label="추가" size="compact"><Plus size={14} aria-hidden="true" /></IconButton>
      </Row>
      <Row title="Alert">
        <div className="grid w-full max-w-lg gap-3">
          <Alert title="알림">중립 알림이에요.</Alert>
          <Alert title="저장했어요" tone="success" />
          <Alert title="주의" tone="warning">다른 곳에서 바뀌었어요.</Alert>
          <Alert title="불러오지 못했어요" tone="danger" onDismiss={() => {}} action={<Button variant="secondary" className="mt-3">다시 시도</Button>}>서버에 연결하지 못했어요.</Alert>
        </div>
      </Row>
      <Row title="Spinner">
        <Spinner size="small" /><Spinner /><Spinner size="large" />
        <Spinner variant="orbit" /><Spinner tone="muted" />
      </Row>
    </div>
  ),
};
