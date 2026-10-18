import { useId, type CSSProperties } from "react";
import type { FieldProps } from "./field";

export type SliderProps = FieldProps & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  valueText?: string;
  isDisabled?: boolean;
};
export function Slider({
  label,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  valueText = String(value),
  isDisabled = false,
  description,
  error,
}: SliderProps) {
  const id = useId();
  const percentage =
    max > min
      ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
      : 0;
  return (
    <div className="gc-field gc-slider">
      <div className="gc-slider-heading">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} aria-hidden="true">
          {valueText}
        </output>
      </div>
      <input
        id={id}
        className="gc-slider-input"
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={isDisabled}
        aria-valuetext={valueText}
        aria-invalid={!!error}
        aria-describedby={error || description ? `${id}-help` : undefined}
        style={{ "--gc-slider-percentage": `${percentage}%` } as CSSProperties}
        onChange={(event) => onValueChange(Number(event.target.value))}
      />
      {(error || description) && (
        <small id={`${id}-help`} className={error ? "gc-error" : "gc-help"}>
          {error || description}
        </small>
      )}
    </div>
  );
}
