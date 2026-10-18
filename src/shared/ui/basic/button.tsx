import type { ComponentPropsWithRef } from "react";

export function Button({
  children,
  isLoading = false,
  variant = "primary",
  disabled,
  ...props
}: ComponentPropsWithRef<"button"> & {
  isLoading?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`gc-button gc-button-${variant} ${props.className ?? ""}`}
    >
      <span
        className={`gc-button-content ${isLoading ? "gc-button-hidden" : ""}`}
      >
        {children}
      </span>
      {isLoading && (
        <span className="gc-button-loading" aria-label="처리 중">
          •••
        </span>
      )}
    </button>
  );
}
export function IconButton({
  label,
  children,
  appearance = "ghost",
  size = "default",
  ...props
}: Omit<Parameters<typeof Button>[0], "aria-label"> & {
  label: string;
  appearance?: "ghost" | "filled";
  size?: "default" | "compact";
}) {
  return (
    <Button
      {...props}
      aria-label={label}
      className={`gc-icon-button gc-icon-button-${appearance} gc-icon-button-${size} ${props.className ?? ""}`}
    >
      {children}
    </Button>
  );
}
