import { BookOpen, House, Network } from "lucide-react";
import type { ShellItem } from "../shared/ui/layout/AppShell";

export function workNav(workId: string): ShellItem[] {
  const base = `/works/${workId}`;
  return [
    { key: "home", label: "홈", to: "/", icon: <House size={22} />, end: true },
    { key: "manuscript", label: "원고", to: base, icon: <BookOpen size={22} />, end: true },
    { key: "graph", label: "관계도", to: `${base}/graph`, icon: <Network size={22} /> },
  ];
}
