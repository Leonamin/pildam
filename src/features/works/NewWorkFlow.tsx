import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { Graph, GraphSuggestion, ModelOption, OnboardResponse, TextDoc, Work } from "../../../shared/types";
import { api } from "../../shared/api";
import { useApi } from "../../shared/useApi";
import { useMedia } from "../../shared/useMedia";
import { Alert } from "../../shared/ui/basic/alert";
import { Button } from "../../shared/ui/basic/button";
import { Spinner } from "../../shared/ui/basic/spinner";
import { TextArea } from "../../shared/ui/basic/text-area";
import { TextField } from "../../shared/ui/basic/text-field";
import { Dialog, Drawer } from "../../shared/ui/overlays/dialog";
import { Select } from "../../shared/ui/overlays/select";
import { applySuggestions } from "../graph/suggestions";

const TONES = ["담담한", "설레는", "어두운", "유쾌한"];
const KIND = { character: "인물", place: "장소", faction: "세력", item: "사물" } as const;

function describe(s: GraphSuggestion) {
  if (s.type === "add-node") return { head: `${KIND[s.node.kind]} · ${s.node.name}`, body: s.node.description };
  if (s.type === "add-edge") return { head: `${s.sourceName} ↔ ${s.targetName}`, body: s.label };
  return { head: `${s.sourceName} ↔ ${s.targetName}`, body: `${s.label} 끝` };
}

/** 새 작품 만들기: 질문 3개 → AI 초안 → 확인 → 시작. 데스크탑은 Dialog, 모바일은 전체 화면 Drawer. */
export function NewWorkFlow({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const wide = useMedia("(min-width: 768px)");
  const Shell = wide ? Dialog : Drawer;
  return (
    <Shell
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title="새 작품"
      shouldCloseOnOutsideClick={false}
      className={wide ? "" : "h-dvh max-h-dvh rounded-none"}
    >
      {isOpen && <Flow />}
    </Shell>
  );
}

type Phase = "ask" | "working" | "review";

function Flow() {
  const navigate = useNavigate();
  const { data: models } = useApi((s) => api.get<ModelOption[]>("/api/models", s), []);
  const [modelId, setModelId] = useState("");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(["", "", ""]);
  const [phase, setPhase] = useState<Phase>("ask");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OnboardResponse | null>(null);
  const [title, setTitle] = useState("");
  const [world, setWorld] = useState("");
  const [style, setStyle] = useState("");
  const [checked, setChecked] = useState<boolean[]>([]);
  const workId = useRef<string | null>(null); // 한 번 만들면 다시 만들지 않는다
  const done = useRef(new Set<string>()); // 시작 단계 중 끝낸 것 (재시도 때 중복 방지)
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);

  const model = modelId || models?.[0]?.id || "";
  const setAnswer = (i: number, v: string) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)));

  async function ensureWork() {
    if (!workId.current) workId.current = (await api.post<Work>("/api/works", { title: "제목 없는 이야기" })).id;
    return workId.current;
  }
  async function addFirstChapter(id: string) {
    if (done.current.has("chapter")) return;
    await api.post(`/api/works/${id}/chapters`, { title: "제목 없음" });
    done.current.add("chapter");
  }
  async function skip() {
    setBusy(true);
    setError("");
    try {
      const id = await ensureWork();
      await addFirstChapter(id);
      navigate(`/works/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "만들지 못했어요.");
      setBusy(false);
    }
  }

  async function askAi() {
    setPhase("working");
    setError("");
    ctl.current = new AbortController();
    try {
      const id = await ensureWork();
      const text = [`쓰고 싶은 이야기: ${answers[0].trim()}`, answers[1].trim() && `주인공: ${answers[1].trim()}`, answers[2].trim() && `원하는 느낌: ${answers[2].trim()}`]
        .filter(Boolean)
        .join("\n");
      const r = await api.post<OnboardResponse>(`/api/works/${id}/ai/onboard`, { answers: text, modelId: model }, ctl.current.signal);
      setResult(r);
      setTitle(r.title);
      setWorld(r.world);
      setStyle(r.style);
      setChecked(r.suggestions.map(() => true));
      setPhase("review");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "AI가 답하지 못했어요.");
      setPhase("ask");
      setStep(2);
    }
  }

  async function start() {
    if (!result || !workId.current) return;
    const id = workId.current;
    setBusy(true);
    setError("");
    try {
      if (!done.current.has("meta")) {
        await api.patch(`/api/works/${id}`, { title: title.trim() || "제목 없는 이야기", modelId: model });
        done.current.add("meta");
      }
      for (const [name, text] of [["world", world], ["style", style]] as const) {
        if (done.current.has(name)) continue;
        const d = await api.get<TextDoc>(`/api/works/${id}/docs/${name}`);
        await api.put(`/api/works/${id}/docs/${name}`, { text, baseUpdatedAt: d.updatedAt });
        done.current.add(name);
      }
      if (!done.current.has("graph")) {
        const g = await api.get<Graph>(`/api/works/${id}/graph`);
        const picked = result.suggestions.filter((_, i) => checked[i]);
        await api.put(`/api/works/${id}/graph`, { graph: applySuggestions(g, picked), baseUpdatedAt: g.updatedAt });
        done.current.add("graph");
      }
      await addFirstChapter(id);
      navigate(`/works/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
      setBusy(false);
    }
  }

  if (phase === "working")
    return (
      <div className="grid place-items-center gap-4 py-12 text-center" aria-live="polite">
        <Spinner size="large" label="설정을 정리하는 중" />
        <p className="m-0">설정을 정리하고 있어요…</p>
        <Button variant="secondary" onClick={() => { ctl.current?.abort(); setPhase("ask"); setStep(2); }}>취소</Button>
      </div>
    );

  if (phase === "review" && result)
    return (
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void start(); }}>
        <p className="m-0 text-sm text-muted">AI가 정리한 초안이에요. 마음에 안 드는 곳은 고쳐 쓰세요.</p>
        <TextField label="제목" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
        <TextArea label="세계관" value={world} onChange={(e) => setWorld(e.target.value)} shouldAutoSize />
        <TextArea label="문체" value={style} onChange={(e) => setStyle(e.target.value)} shouldAutoSize />
        {result.suggestions.length > 0 && (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-sm font-medium">인물·관계 (관계도에 넣을 것을 고르세요)</legend>
            {result.suggestions.map((s, i) => {
              const d = describe(s);
              return (
                <label key={i} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3">
                  <input type="checkbox" className="mt-1 size-5 accent-[var(--gc-accent)]" checked={checked[i] ?? false} onChange={(e) => setChecked((c) => c.map((x, j) => (j === i ? e.target.checked : x)))} />
                  <span className="flex flex-col">
                    <span className="font-semibold">{d.head}</span>
                    {d.body && <span className="text-sm text-muted">{d.body}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        {error && <Alert tone="danger" title="시작하지 못했어요">{error}</Alert>}
        <div className="gc-actions">
          <Button variant="secondary" onClick={() => { setPhase("ask"); setStep(0); setError(""); }} disabled={busy}>처음부터 다시</Button>
          <Button type="submit" isLoading={busy} disabled={!title.trim()}>{error ? "다시 시도" : "이대로 시작"}</Button>
        </div>
      </form>
    );

  const qs = [
    { q: "어떤 이야기를 쓰고 싶어요?", hint: "한두 문장이면 충분해요. 예: 비 오는 날 옛 연인을 다시 만나는 이야기", required: true },
    { q: "주인공은 누구예요?", hint: "이름, 나이, 성격 등 떠오르는 대로 적어 주세요.", required: false },
    { q: "어떤 느낌의 글이면 좋겠어요?", hint: "", required: false },
  ];
  const cur = qs[step];
  const last = step === 2;
  const canNext = !cur.required || answers[step].trim().length > 0;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canNext || busy) return;
        if (last) void askAi();
        else setStep(step + 1);
      }}
    >
      <p className="m-0 text-sm text-muted">{step + 1} / 3</p>
      <h3 className="m-0 text-lg font-semibold">{cur.q}</h3>
      <TextArea key={step} label="답변" aria-label={cur.q} description={cur.hint || undefined} value={answers[step]} onChange={(e) => setAnswer(step, e.target.value)} autoFocus maxLength={1000} />
      {last && (
        <div className="flex flex-wrap gap-2" aria-label="느낌 예시">
          {TONES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setAnswer(2, answers[2].trim() ? `${answers[2].trim()}, ${t}` : t)}
              className="min-h-11 cursor-pointer rounded-full border border-line bg-accent-soft px-4 text-sm text-ink"
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {last && models && models.length > 0 && <Select label="AI" value={model} onValueChange={setModelId} options={models.map((m) => ({ value: m.id, label: m.label }))} />}
      {error && (
        <Alert tone="danger" title="초안을 받지 못했어요">
          {error}
        </Alert>
      )}
      <div className="gc-actions">
        {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={busy}>이전</Button>}
        {last && error && <Button variant="secondary" onClick={() => void skip()} isLoading={busy}>건너뛰기</Button>}
        <Button type="submit" disabled={!canNext || busy || (last && !model)}>
          {last ? (error ? "다시 시도" : "AI에게 초안 받기") : "다음"}
        </Button>
      </div>
      {step === 0 && (
        <button type="button" onClick={() => void skip()} disabled={busy} className="min-h-11 cursor-pointer self-center border-0 bg-transparent text-sm text-muted underline">
          건너뛰고 빈 작품으로 시작
        </button>
      )}
    </form>
  );
}
