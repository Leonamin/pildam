import type { CSSProperties } from "react";

export function Skeleton({
  width = "100%",
  height = 18,
}: {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
}) {
  return (
    <span
      className="gc-skeleton"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
