import { X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./button";

export function Alert({
  title,
  children,
  tone = "neutral",
  onDismiss,
  action,
}: {
  title: string;
  children?: ReactNode;
  tone?: "neutral" | "success" | "danger" | "warning";
  onDismiss?: () => void;
  action?: ReactNode;
}) {
  return (
    <div
      className={`gc-alert gc-tone-${tone}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <div>
        <strong>{title}</strong>
        {children && <div>{children}</div>}
        {action}
      </div>
      {onDismiss && (
        <IconButton
          label="알림 닫기"
          appearance="ghost"
          className="gc-alert-close"
          onClick={onDismiss}
        >
          <X size={16} aria-hidden="true" />
        </IconButton>
      )}
    </div>
  );
}
