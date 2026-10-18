import { useId } from "react";
import { Select as RSelect } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import type { Option } from "./types";

export function Select({
  label,
  value,
  onValueChange,
  options,
  isDisabled = false,
  placeholder = "선택하세요",
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  isDisabled?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="gc-overlay-field">
      <label id={id}>{label}</label>
      <RSelect.Root
        value={value}
        onValueChange={onValueChange}
        disabled={isDisabled}
      >
        <RSelect.Trigger className="gc-select" aria-labelledby={id}>
          <RSelect.Value placeholder={placeholder} />
          <RSelect.Icon>
            <ChevronDown size={16} />
          </RSelect.Icon>
        </RSelect.Trigger>
        <RSelect.Portal>
          <RSelect.Content
            className="gc-floating gc-select-content"
            position="popper"
            sideOffset={6}
          >
            <RSelect.ScrollUpButton>↑</RSelect.ScrollUpButton>
            <RSelect.Viewport>
              {options.map((option) => (
                <RSelect.Item
                  className="gc-option"
                  data-value={option.value}
                  key={option.value}
                  value={option.value}
                  disabled={option.isDisabled}
                >
                  <RSelect.ItemText>{option.label}</RSelect.ItemText>
                  <RSelect.ItemIndicator>
                    <Check size={15} />
                  </RSelect.ItemIndicator>
                </RSelect.Item>
              ))}
            </RSelect.Viewport>
            <RSelect.ScrollDownButton>↓</RSelect.ScrollDownButton>
          </RSelect.Content>
        </RSelect.Portal>
      </RSelect.Root>
    </div>
  );
}
