import type { ReactNode } from "react";
import { Popover as RPopover } from "radix-ui";
import { X } from "lucide-react";

export function Popover({
  trigger,
  children,
  label,
}: {
  trigger: ReactNode;
  children: ReactNode;
  label: string;
}) {
  return (
    <RPopover.Root>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content
          className="gc-floating gc-popover"
          sideOffset={8}
          aria-label={label}
        >
          <RPopover.Close className="gc-overlay-close" aria-label="닫기">
            <X size={16} />
          </RPopover.Close>
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}
