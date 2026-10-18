import type { ReactNode } from "react";
import { DropdownMenu } from "radix-ui";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  isDisabled?: boolean;
  isDangerous?: boolean;
};
export function Menu({
  trigger,
  items,
}: {
  trigger: ReactNode;
  items: MenuItem[];
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="gc-floating" sideOffset={6}>
          {items.map((item, index) => (
            <DropdownMenu.Item
              key={index}
              className={`gc-option ${item.isDangerous ? "gc-danger" : ""}`}
              disabled={item.isDisabled}
              onSelect={item.onSelect}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
