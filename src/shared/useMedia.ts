import { useSyncExternalStore } from "react";

/** CSS 미디어 쿼리 일치 여부. 예: useMedia("(min-width: 768px)") */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
  );
}
