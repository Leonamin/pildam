import { useRef, useState, type ReactNode } from "react";
import { Dialog } from "../overlays/dialog";
import { Button } from "../basic/button";

export function ConfirmDialog({
  trigger,
  isOpen: controlledOpen,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "삭제",
}: {
  trigger?: ReactNode;
  isOpen?: boolean; // pildam: 메뉴 항목에서 열 수 있게 제어 모드 추가
  onOpenChange?: (isOpen: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  confirmLabel?: string;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = controlledOpen ?? innerOpen;
  const setIsOpen = onOpenChange ?? setInnerOpen;
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isPendingRef = useRef(false);
  async function confirm() {
    if (isPendingRef.current) return;
    isPendingRef.current = true;
    setIsPending(true);
    setError("");
    try {
      await onConfirm();
      setIsOpen(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "요청에 실패했습니다. 다시 시도하세요.",
      );
    } finally {
      isPendingRef.current = false;
      setIsPending(false);
    }
  }
  return (
    <Dialog
      trigger={trigger}
      title={title}
      description={description}
      isOpen={isOpen}
      onOpenChange={(next) => {
        if (!isPendingRef.current) {
          setIsOpen(next);
          if (next) setError("");
        }
      }}
      shouldCloseOnOutsideClick={false}
      initialFocusRef={cancelRef}
      footer={
        <div className="gc-actions">
          <Button
            ref={cancelRef}
            variant="secondary"
            onClick={() => setIsOpen(false)}
            disabled={isPending}
          >
            취소
          </Button>
          <Button variant="danger" onClick={confirm} disabled={isPending}>
            {isPending ? "처리 중…" : confirmLabel}
          </Button>
        </div>
      }
    >
      {error && (
        <p role="alert" className="gc-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
