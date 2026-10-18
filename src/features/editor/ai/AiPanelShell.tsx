// 모든 대상(화·문체·노트·관계도)이 같이 쓰는 AI 패널 껍데기.
// 위에서부터: AI 고르기(+header) → 지시 기록 → 오류 알림 → children(대상별 입력·버튼 영역).
//
// <AiPanelShell
//   work={Work}                          현재 작품 (work.modelId가 고른 AI)
//   target={AiTarget | null}             기록을 불러올 대상. null이면 emptyText만 보인다. 바뀌면 붙인 노트·오류가 초기화된다.
//   notes={NoteMeta[]}                   작품의 설정 노트 목록 (노트 붙이기·참고한 노트 링크에 쓴다)
//   onWork={(w) => …}                    AI를 바꾸면 갱신된 Work를 올려 준다
//   onOpenNote={(noteId) => …}           "참고한 노트" 칩을 눌렀을 때
//   historyKey={number}                  값이 바뀌면 기록을 다시 불러온다 (AI 호출이 끝날 때마다 올린다)
//   busy={boolean}                       AI 실행 중이면 true (AI 고르기·노트 붙이기 잠금)
//   header?={ReactNode}                  AI 고르기 아래 줄 (예: 이전 버전 버튼)
//   entryActions?={(e: ChatEntry) => ReactNode}   기록 한 줄 아래 버튼 (예: 되돌리기)
//   emptyText?={ReactNode}               기록이 없을 때 안내 문구
// >
//   {(ctx: ShellContext) => ReactNode}   대상별 영역. ctx.attach(칩+노트 붙이기+안내 한 줄)를 입력창 근처에 놓고,
//                                        ctx.noteIds·ctx.modelId를 요청에 담고, 실패는 ctx.fail(err, retry?),
//                                        AI가 참고한 노트는 ctx.setUsedNotes(titles)로 알린다(방금 항목에 표시).
// </AiPanelShell>
//
// 모델 고르기만 따로 쓰려면 useModelSelect(work, onWork, onError).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AiTarget, ChatEntry, ModelOption, NoteMeta, Work } from "../../../../shared/types";
import { targetKey } from "../../../../shared/types";
import { api, ApiRequestError } from "../../../shared/api";
import { useApi } from "../../../shared/useApi";
import { relativeTime } from "../../../shared/time";
import { Alert } from "../../../shared/ui/basic/alert";
import { Button } from "../../../shared/ui/basic/button";
import { Select } from "../../../shared/ui/overlays/select";
import { NoteChips, NotePicker, noteLabel } from "./NotePicker";

export const KIND_LABEL: Record<ChatEntry["kind"], string> = {
  write: "이어 쓰기", revise: "고쳐 쓰기", rewrite: "선택 수정", summarize: "정리", edit: "문서 고치기", graph: "관계도",
};

export type Failure = { code: string; message: string; retry?: () => void };
export type ShellContext = {
  modelId: string;
  noteIds: string[];
  attach: ReactNode;
  fail: (e: unknown, retry?: () => void) => void;
  clearFailure: () => void;
  setUsedNotes: (titles: string[]) => void;
};

/** AI 목록과 선택. 고르면 작품에 저장하고 onWork로 알린다. */
export function useModelSelect(work: Work, onWork: (w: Work) => void, onError: (e: unknown) => void) {
  const { data: models } = useApi((s) => api.get<ModelOption[]>("/api/models", s), []);
  const options = useMemo(() => models?.map((m) => ({ value: m.id, label: m.label })) ?? [], [models]);
  const pick = async (id: string) => {
    try {
      onWork(await api.patch<Work>(`/api/works/${work.id}`, { modelId: id }));
    } catch (e) {
      onError(e);
    }
  };
  return { modelId: work.modelId, options, pick };
}

export function AiPanelShell({
  work, target, notes, onWork, onOpenNote, historyKey, busy, header, entryActions, emptyText, children,
}: {
  work: Work;
  target: AiTarget | null;
  notes: NoteMeta[];
  onWork: (w: Work) => void;
  onOpenNote: (noteId: string) => void;
  historyKey: number;
  busy: boolean;
  header?: ReactNode;
  entryActions?: (e: ChatEntry) => ReactNode;
  emptyText?: ReactNode;
  children: (ctx: ShellContext) => ReactNode;
}) {
  const tk = target ? targetKey(target) : "";
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attached, setAttached] = useState<string[]>([]);
  const [lastUsed, setLastUsed] = useState<string[] | null>(null);
  const selectBox = useRef<HTMLDivElement>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  const fail = (e: unknown, retry?: () => void) =>
    setFailure({ code: e instanceof ApiRequestError ? e.code : "unknown", message: e instanceof Error ? e.message : "문제가 생겼어요.", retry });
  const { modelId, options, pick } = useModelSelect(work, onWork, fail);
  const { data: chat } = useApi(
    (s) => (tk ? api.get<ChatEntry[]>(`/api/works/${work.id}/chat?target=${encodeURIComponent(tk)}`, s) : Promise.resolve([] as ChatEntry[])),
    [work.id, tk, historyKey],
  );

  useEffect(() => {
    setFailure(null);
    setAttached([]);
    setLastUsed(null);
  }, [tk]);
  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "end" });
  }, [chat]);
  // 목록에서 사라진(지운) 노트는 붙임에서 뺀다.
  const noteIds = attached.filter((id) => notes.some((n) => n.id === id));

  const attach = (
    <div className="flex flex-col gap-1.5">
      <NoteChips notes={notes} value={noteIds} onChange={setAttached} disabled={busy} />
      {notes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <NotePicker notes={notes} value={noteIds} onChange={setAttached} disabled={busy} />
          {noteIds.length === 0 && <span className="text-xs text-muted">AI가 필요한 노트를 알아서 찾아요</span>}
        </div>
      )}
    </div>
  );

  const open = (label: string) => {
    const n = notes.find((x) => noteLabel(x) === label || x.title === label);
    return n ? () => onOpenNote(n.id) : undefined;
  };

  return (
    <section aria-label="AI" className="flex h-full flex-col gap-3 px-4 pt-4 pb-24">
      <div className="flex flex-col gap-2">
        <div ref={selectBox} className="min-w-0">
          <Select
            label="AI 고르기"
            value={options.some((o) => o.value === modelId) ? modelId : ""}
            onValueChange={(v) => void pick(v)}
            options={options}
            isDisabled={busy}
            placeholder="AI 고르기"
          />
        </div>
        {header}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {chat && chat.length === 0 && emptyText && <p className="m-0 mt-4 text-center text-sm text-muted">{emptyText}</p>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {chat?.map((e, i) => {
            const used = e.usedNotes ?? (i === chat.length - 1 ? lastUsed : null);
            return (
              <li key={e.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span className="font-semibold text-ink">{KIND_LABEL[e.kind]}</span>
                  <time dateTime={e.at}>{relativeTime(e.at)}</time>
                </div>
                <p className="m-0 mt-1 break-words">{e.instruction}</p>
                {e.resultPreview && <p className="m-0 mt-1 line-clamp-2 text-xs text-muted">{e.resultPreview}</p>}
                {used && used.length > 0 && (
                  <p className="m-0 mt-1 text-xs text-muted">
                    참고한 노트:{" "}
                    {used.map((u, k) => {
                      const go = open(u);
                      return (
                        <span key={k}>
                          {k > 0 && ", "}
                          {go ? (
                            <button type="button" onClick={go} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent underline">{u}</button>
                          ) : u}
                        </span>
                      );
                    })}
                  </p>
                )}
                {entryActions?.(e)}
              </li>
            );
          })}
        </ul>
        <div ref={listEnd} />
      </div>

      {failure && (
        <Alert
          title={failure.code === "ai_unavailable" ? "지금은 이 AI를 쓸 수 없어요" : "AI가 쓰지 못했어요"}
          tone="danger"
          onDismiss={() => setFailure(null)}
          action={
            failure.code === "ai_unavailable" ? (
              <Button variant="secondary" className="mt-2 min-h-11" onClick={() => selectBox.current?.querySelector("button")?.click()}>AI 고르기</Button>
            ) : failure.retry ? (
              <Button variant="secondary" className="mt-2 min-h-11" onClick={failure.retry}>다시 시도</Button>
            ) : undefined
          }
        >
          {failure.message}
        </Alert>
      )}

      {children({ modelId, noteIds, attach, fail, clearFailure: () => setFailure(null), setUsedNotes: setLastUsed })}
    </section>
  );
}
