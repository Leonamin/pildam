import {
  useId,
  useRef,
  useState,
  useEffect,
  type TextareaHTMLAttributes,
} from "react";
import type { FieldProps } from "./field";

export function TextArea({
  label,
  description,
  error,
  shouldAutoSize = false,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> &
  FieldProps & { shouldAutoSize?: boolean }) {
  const generated = useId();
  const id = props.id ?? generated;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [currentText, setCurrentText] = useState(
    String(props.defaultValue ?? ""),
  );
  const resize = () => {
    if (shouldAutoSize && ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${Math.min(240, Math.max(90, ref.current.scrollHeight))}px`;
    }
  };
  useEffect(resize, [props.value, shouldAutoSize]);
  return (
    <div className="gc-field">
      <label htmlFor={id}>
        {label}
        {props.required && <span aria-hidden="true"> *</span>}
      </label>
      <textarea
        {...props}
        ref={ref}
        id={id}
        className="gc-input gc-textarea"
        aria-invalid={!!error}
        aria-describedby={error || description ? `${id}-help` : undefined}
        onChange={(event) => {
          setCurrentText(event.target.value);
          resize();
          props.onChange?.(event);
        }}
      />
      {props.maxLength !== undefined && (
        <small className="gc-help">
          {String(props.value ?? currentText).length} / {props.maxLength}
        </small>
      )}
      {(error || description) && (
        <small id={`${id}-help`} className={error ? "gc-error" : "gc-help"}>
          {error || description}
        </small>
      )}
    </div>
  );
}
