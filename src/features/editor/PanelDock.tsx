import { FileText, ListTree, Sparkles } from "lucide-react";

export type PanelKey = "outline" | "manuscript" | "ai";
const ITEMS: { key: PanelKey; label: string; icon: React.ReactNode }[] = [
  { key: "outline", label: "목차", icon: <ListTree size={18} aria-hidden="true" /> },
  { key: "manuscript", label: "원고", icon: <FileText size={18} aria-hidden="true" /> },
  { key: "ai", label: "AI", icon: <Sparkles size={18} aria-hidden="true" /> },
];

/** 화면 아래 가운데에 떠 있는 전환 버튼. 데스크탑은 켜고 끄기, 모바일은 탭 전환. */
export function PanelDock({ pressed, onToggle }: { pressed: Record<PanelKey, boolean>; onToggle: (k: PanelKey) => void }) {
  return (
    <div role="group" aria-label="화면 전환" className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-full border border-line bg-surface p-1.5 shadow-[var(--gc-shadow)]">
      {ITEMS.map((it) => (
        <button
          key={it.key}
          type="button"
          aria-pressed={pressed[it.key]}
          onClick={() => onToggle(it.key)}
          className={`flex min-h-11 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border-0 px-3 text-sm sm:px-4 font-medium ${
            pressed[it.key] ? "bg-accent text-on-accent" : "bg-transparent text-ink hover:bg-black/5"
          }`}
        >
          {it.icon} {it.label}
        </button>
      ))}
    </div>
  );
}

