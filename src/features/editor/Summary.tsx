import { X } from "lucide-react";
import type { ChapterMeta, GraphSuggestion } from "../../../shared/types";
import { SuggestionList } from "../graph/SuggestionList";

export type SummaryResult = { chapterLabel: string; summary: string; suggestions: GraphSuggestion[] };

export function SummaryCards({ workId, chapters = [], result, onClose }: { workId: string; chapters?: ChapterMeta[]; result: SummaryResult; onClose: () => void }) {
  return (
    <section aria-label="정리 결과" className="flex flex-col gap-3 rounded-xl border border-line bg-surface-subtle p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">{result.chapterLabel} 정리</h3>
        <button type="button" aria-label="닫기" onClick={onClose} className="grid min-h-8 min-w-8 cursor-pointer place-items-center border-0 bg-transparent text-muted"><X size={16} aria-hidden="true" /></button>
      </div>
      <p className="m-0 text-sm leading-relaxed">{result.summary}</p>
      {result.suggestions.length > 0 && <SuggestionList workId={workId} chapters={chapters} suggestions={result.suggestions} />}
    </section>
  );
}
