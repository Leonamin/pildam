import { useParams } from "react-router";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { workNav } from "../../app/workNav";

// 자리표시자: 관계도 담당이 이 파일을 교체한다.
export function GraphPage() {
  const { workId = "" } = useParams();
  return (
    <AppShell items={workNav(workId)}>
      <main className="p-6">
        <h1 className="m-0 text-2xl font-semibold">관계도</h1>
        <p className="text-muted">준비 중</p>
      </main>
    </AppShell>
  );
}
