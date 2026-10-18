import type { ReactNode } from "react";
import { Tooltip as RTooltip } from "radix-ui";

export function Tooltip({
  children,
  content,
}: {
  children: ReactNode;
  content: string;
}) {
  return (
    <RTooltip.Provider delayDuration={350}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
        <RTooltip.Portal>
          <RTooltip.Content className="gc-tooltip" sideOffset={7}>
            {content}
            <RTooltip.Arrow />
          </RTooltip.Content>
        </RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  );
}
