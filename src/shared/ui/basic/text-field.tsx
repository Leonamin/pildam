import { useId, type InputHTMLAttributes } from "react";
import { Input } from "./input";
import type { FieldProps } from "./field";

export function TextField({
  label,
  description,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  const generated = useId();
  const id = props.id ?? generated;
  return (
    <div className="gc-field">
      <label htmlFor={id}>
        {label}
        {props.required && <span aria-hidden="true"> *</span>}
      </label>
      <Input
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || description ? `${id}-help` : undefined}
      />
      {(error || description) && (
        <small id={`${id}-help`} className={error ? "gc-error" : "gc-help"}>
          {error || description}
        </small>
      )}
    </div>
  );
}
