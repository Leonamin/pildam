import type { ReactNode, RefObject, KeyboardEvent } from "react";
import { Dialog as RDialog } from "radix-ui";
import { X } from "lucide-react";

export type DialogProps = {
  trigger?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  shouldCloseOnOutsideClick?: boolean;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  shouldCloseOnEscape?: boolean;
};

function loopModalFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (
    event.key !== "Tab" ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.defaultPrevented ||
    !event.currentTarget.contains(event.target as Node)
  )
    return;
  const modal = event.currentTarget;
  const candidates = Array.from(
    modal.querySelectorAll<HTMLElement>("*"),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !element.closest("[hidden], [inert]") &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility === "visible",
  );
  const first = candidates[0];
  const last = candidates.at(-1);
  if (!first || !last) {
    event.preventDefault();
    modal.focus();
    return;
  }
  const edge = event.shiftKey ? first : last;
  if (modal.ownerDocument.activeElement !== edge) return;
  // A nested Popover temporarily pauses Radix's parent scope until deferred cleanup.
  // Keep only the modal's Tab boundaries synchronous; portalled child scopes own their keys.
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
}

function Modal({
  trigger,
  title,
  description,
  children,
  footer,
  shouldCloseOnOutsideClick = true,
  isOpen,
  onOpenChange,
  initialFocusRef,
  className,
  shouldCloseOnEscape = true,
  isDrawer = false,
}: DialogProps & { isDrawer?: boolean }) {
  return (
    <RDialog.Root open={isOpen} onOpenChange={onOpenChange}>
      {trigger && <RDialog.Trigger asChild>{trigger}</RDialog.Trigger>}
      <RDialog.Portal>
        <RDialog.Overlay className="gc-modal-overlay" />
        <RDialog.Content
          className={`gc-modal ${isDrawer ? "gc-drawer" : ""} ${className ?? ""}`}
          {...(!description ? { "aria-describedby": undefined } : {})}
          onKeyDownCapture={loopModalFocus}
          onOpenAutoFocus={(event) => {
            if (initialFocusRef?.current) {
              event.preventDefault();
              initialFocusRef.current.focus();
            } else {
              // 입력칸이 있으면 닫기 버튼 대신 거기에 포커스를 둔다(메뉴에서 열 때 React autoFocus가 밀린다).
              const input = (event.currentTarget as HTMLElement).querySelector<HTMLElement>("input, textarea");
              if (input) {
                event.preventDefault();
                input.focus();
              }
            }
          }}
          onEscapeKeyDown={(event) => {
            if (!shouldCloseOnEscape) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!shouldCloseOnOutsideClick) event.preventDefault();
          }}
        >
          <header>
            <RDialog.Title>{title}</RDialog.Title>
            {description && (
              <RDialog.Description>{description}</RDialog.Description>
            )}
            <RDialog.Close className="gc-overlay-close" aria-label="닫기">
              <X size={20} />
            </RDialog.Close>
          </header>
          <div className="gc-modal-body">{children}</div>
          {footer && <footer>{footer}</footer>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
export function Dialog(props: DialogProps) {
  return <Modal {...props} />;
}
export function Drawer(props: DialogProps) {
  return <Modal {...props} isDrawer />;
}
export function DialogClose({ children }: { children: ReactNode }) {
  return <RDialog.Close asChild>{children}</RDialog.Close>;
}
