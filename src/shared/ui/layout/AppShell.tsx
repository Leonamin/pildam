import type { ReactNode } from "react";
import { NavLink } from "react-router";

export type ShellItem = { key: string; label: string; to: string; icon: ReactNode; end?: boolean };

/** 왼쪽 아이콘 줄(데스크탑) / 위 막대(모바일). 도메인 모름: 항목은 props로 받는다. */
export function AppShell({
  items,
  children,
  footer,
}: {
  items: ShellItem[];
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-bg text-ink md:flex-row">
      <nav
        aria-label="주 메뉴"
        className="flex shrink-0 items-stretch gap-1 border-b border-line bg-surface px-2 md:w-[72px] md:flex-col md:border-r md:border-b-0 md:px-0 md:py-3"
      >
        {items.map((it) => (
          <NavLink
            key={it.key}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              `flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium no-underline md:mx-2 md:flex-none ${
                isActive ? "bg-accent-soft text-ink" : "text-muted hover:bg-black/5"
              }`
            }
          >
            <span aria-hidden="true">{it.icon}</span>
            {it.label}
          </NavLink>
        ))}
        {footer && <div className="flex items-center justify-center md:mt-auto">{footer}</div>}
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
