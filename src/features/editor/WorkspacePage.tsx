import { useParams } from "react-router";
import type { Work } from "../../../shared/types";
import { api } from "../../shared/api";
import { useApi } from "../../shared/useApi";
import { AppShell } from "../../shared/ui/layout/AppShell";
import { workNav } from "../../app/workNav";

// 자리표시자: 에디터 담당이 이 파일을 교체한다.
export function WorkspacePage() {
  const { workId = "" } = useParams();
  const { data: work } = useApi((s) => api.get<Work>(`/api/works/${workId}`, s), [workId]);
  return (
    <AppShell items={workNav(workId)}>
      <main className="p-6">
        <h1 className="m-0 font-manuscript text-2xl font-semibold">{work?.title ?? ""}</h1>
        <p className="text-muted">준비 중</p>
      </main>
    </AppShell>
  );
}
