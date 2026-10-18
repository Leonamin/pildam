import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Toast as RToast } from "radix-ui";
import { Check, Info, TriangleAlert, CircleAlert, X } from "lucide-react";
import { Button, IconButton } from "../basic/button";
export type ToastMessage = {
  title: string;
  description?: string;
  tone?: "info" | "success" | "warning" | "error";
  action?: { label: string; onClick: () => void };
  timer?: "bar" | "circle" | "none";
  appearance?: "surface" | "tinted" | "solid";
  durationMs?: number;
};
export type ToastLayout = "list" | "stack";
export type ToastDirection = "up" | "down";
const ToastContext = createContext<((message: ToastMessage) => void) | null>(
  null,
);
export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useToast requires ToastProvider");
  return { notify };
}
function duration(message: ToastMessage) {
  if (message.durationMs !== undefined)
    return Number.isFinite(message.durationMs) && message.durationMs > 0
      ? message.durationMs
      : Infinity;
  return message.tone === "error" || message.action ? Infinity : 5000;
}
function classes(message: ToastMessage) {
  return `gc-toast gc-toast-${message.tone || "info"} gc-toast-${message.appearance || "surface"}`;
}
function ToastBody({
  message,
  ratio,
  isPaused,
  isPersistent,
  isLive,
  onClose,
  timerRef,
}: {
  message: ToastMessage;
  ratio: number;
  isPaused: boolean;
  isPersistent: boolean;
  isLive: boolean;
  onClose?: () => void;
  timerRef?: React.Ref<HTMLElement | SVGCircleElement>;
}) {
  const Icon =
    message.tone === "success"
      ? Check
      : message.tone === "warning"
        ? TriangleAlert
        : message.tone === "error"
          ? CircleAlert
          : Info;
  const timer = isPersistent ? "none" : message.timer || "bar";
  const close = (
    <IconButton
      label={
        isPersistent
          ? "알림 닫기 · 자동 닫힘 없음"
          : `알림 닫기 · ${isPaused ? "타이머 일시정지" : "자동 닫힘 진행 중"}`
      }
      size="compact"
      variant="secondary"
      disabled={!isLive && !onClose}
      className={`gc-toast-close ${timer === "circle" ? "gc-toast-circle-close" : ""}`}
      onClick={onClose}
    >
      <X size={14} className="gc-toast-close-x" aria-hidden="true" />
      {timer === "circle" && (
        <svg className="gc-toast-ring" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="gc-toast-ring-track" cx="12" cy="12" r="9" />
          <circle
            ref={timerRef as React.Ref<SVGCircleElement>}
            cx="12"
            cy="12"
            r="9"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={100 * (1 - ratio)}
          />
        </svg>
      )}
    </IconButton>
  );
  return (
    <>
      <div className="gc-toast-content">
        <div className="gc-toast-top">
          <span className="gc-toast-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
          {isLive ? (
            <RToast.Title className="gc-toast-title">
              {message.title}
            </RToast.Title>
          ) : (
            <strong className="gc-toast-title">{message.title}</strong>
          )}
          {isLive ? <RToast.Close asChild>{close}</RToast.Close> : close}
        </div>
        {message.description &&
          (isLive ? (
            <RToast.Description className="gc-toast-description">
              {message.description}
            </RToast.Description>
          ) : (
            <p className="gc-toast-description">{message.description}</p>
          ))}
        {message.action && (
          <div className="gc-toast-action">
            {isLive ? (
              <RToast.Action asChild altText={message.action.label}>
                <Button variant="secondary" onClick={message.action.onClick}>
                  {message.action.label}
                </Button>
              </RToast.Action>
            ) : (
              <Button variant="secondary" onClick={message.action.onClick}>
                {message.action.label}
              </Button>
            )}
          </div>
        )}
      </div>
      {timer === "bar" && (
        <div className="gc-toast-timer-clip">
          <div
            className="gc-toast-timer"
            role="progressbar"
            aria-label={
              isPaused ? "자동 닫힘 타이머 일시정지" : "자동 닫힘 남은 시간"
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            title={isPaused ? "타이머 일시정지" : "자동 닫힘 남은 시간"}
          >
            <span
              ref={timerRef as React.Ref<HTMLSpanElement>}
              style={{ transform: `scaleX(${ratio})` }}
            />
          </div>
        </div>
      )}
    </>
  );
}
function LiveToast({
  message,
  onDismiss,
  isHidden,
  direction,
  onHeight,
  index,
  offset,
  collapsedHeight,
  shouldAnchorTop,
}: {
  message: ToastMessage;
  onDismiss: () => void;
  isHidden: boolean;
  direction: ToastDirection;
  onHeight: (height: number) => void;
  index: number;
  offset: number;
  collapsedHeight: number;
  shouldAnchorTop: boolean;
}) {
  const total = duration(message);
  const isPersistent = !Number.isFinite(total);
  const clock = useRef({
    remaining: total,
    last: 0,
    reasons: new Set<string>(),
    timeout: 0,
  });
  const timerRef = useRef<HTMLElement | SVGCircleElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const [isPaused, setIsPaused] = useState(isHidden);
  const [isClosing, setIsClosing] = useState(false);
  const isClosingRef = useRef(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const close = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    clearTimeout(clock.current.timeout);
    animationRef.current?.pause();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dismissRef.current();
      return;
    }
    setIsClosing(true);
  }, []);
  useLayoutEffect(() => {
    if (!isClosing) return;
    const animations = cardRef.current?.getAnimations() ?? [];
    let isActive = true;
    // CSS owns the exit duration, including overrides and animation:none.
    void Promise.all(
      animations.map((animation) => animation.finished.catch(() => {})),
    ).then(() => {
      if (isActive) dismissRef.current();
    });
    return () => {
      isActive = false;
    };
  }, [isClosing]);
  const sync = useCallback(() => {
    const current = clock.current;
    const now = performance.now();
    if (
      current.last &&
      current.reasons.size === 0 &&
      Number.isFinite(current.remaining)
    )
      current.remaining = Math.max(0, current.remaining - (now - current.last));
    current.last = now;
    clearTimeout(current.timeout);
    const animation = animationRef.current;
    if (animation && Number.isFinite(total)) {
      animation.pause();
      animation.currentTime = total - current.remaining;
      if (current.reasons.size === 0 && !isClosingRef.current) animation.play();
    }
    if (
      !isClosingRef.current &&
      current.reasons.size === 0 &&
      Number.isFinite(current.remaining)
    )
      current.timeout = window.setTimeout(close, current.remaining);
  }, [close, total]);
  const pause = useCallback(
    (reason: string, shouldPause: boolean) => {
      sync();
      const current = clock.current;
      if (shouldPause) current.reasons.add(reason);
      else current.reasons.delete(reason);
      setIsPaused(current.reasons.size > 0);
      sync();
    },
    [sync],
  );
  useLayoutEffect(() => {
    const element = timerRef.current;
    if (
      element &&
      !isPersistent &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      animationRef.current = element.animate(
        message.timer === "circle"
          ? [{ strokeDashoffset: "0" }, { strokeDashoffset: "100" }]
          : [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }],
        { duration: total, fill: "forwards", easing: "linear" },
      );
      animationRef.current.pause();
    }
    clock.current.last = performance.now();
    if (isHidden) clock.current.reasons.add("hidden-stack");
    sync();
    return () => {
      clearTimeout(clock.current.timeout);
      animationRef.current?.cancel();
    };
  }, [total, isPersistent, message.timer, sync]);
  useEffect(() => {
    pause("hidden-stack", isHidden);
  }, [isHidden, pause]);
  useEffect(() => {
    function announceRemaining() {
      const current = clock.current;
      const remaining = Math.max(
        0,
        current.remaining -
          (current.reasons.size === 0 ? performance.now() - current.last : 0),
      );
      if (
        Number.isFinite(total) &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        timerRef.current
      ) {
        const ratio = remaining / total;
        if (message.timer === "circle")
          timerRef.current.setAttribute(
            "stroke-dashoffset",
            String(100 * (1 - ratio)),
          );
        else
          (timerRef.current as HTMLElement).style.transform =
            `scaleX(${ratio})`;
      }
      const bar = cardRef.current?.querySelector("[role=progressbar]");
      if (bar && Number.isFinite(total)) {
        bar.setAttribute(
          "aria-valuenow",
          String(Math.round((remaining / total) * 100)),
        );
        bar.setAttribute(
          "aria-valuetext",
          `${Math.ceil(remaining / 1000)}초 남음${current.reasons.size ? " · 일시정지" : ""}`,
        );
      }
    }
    announceRemaining();
    const interval = window.setInterval(announceRemaining, 1000);
    return () => clearInterval(interval);
  }, [total, isPaused, message.timer]);
  useEffect(() => {
    function visibility() {
      pause("document-hidden", document.hidden);
    }
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [pause]);
  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      onHeight(node.getBoundingClientRect().height),
    );
    onHeight(node.getBoundingClientRect().height);
    observer.observe(node);
    return () => observer.disconnect();
  }, [onHeight]);
  // A slot owns layout translation, leaving the card's transform free for enter/exit motion.
  return (
    <RToast.Root
      asChild
      className="gc-toast-slot"
      style={{
        transform: `translateY(${shouldAnchorTop ? offset : -offset}px)`,
        height: isHidden ? collapsedHeight : undefined,
        zIndex: 100 - index,
        clipPath: isHidden ? `inset(-16px -16px 0 -16px)` : undefined,
      }}
      duration={Infinity}
      open
      forceMount
      onOpenChange={(isOpen) => {
        if (!isOpen) close();
      }}
      onPointerEnter={() => pause("hover", true)}
      onPointerLeave={() => pause("hover", false)}
      onFocusCapture={() => pause("focus", true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          pause("focus", false);
      }}
    >
      <div
        data-index={index}
        data-hidden-stack={isHidden}
        inert={isHidden || isClosing}
        aria-hidden={isHidden || isClosing || undefined}
      >
        <div
          ref={cardRef}
          className={classes(message)}
          data-timer={isPersistent ? "none" : message.timer || "bar"}
          data-paused={isPaused}
          data-persistent={isPersistent}
          data-phase={isClosing ? "closing" : "open"}
          data-direction={direction}
        >
          <ToastBody
            message={message}
            ratio={1}
            isPaused={isPaused}
            isPersistent={isPersistent}
            isLive
            onClose={close}
            timerRef={timerRef}
          />
        </div>
      </div>
    </RToast.Root>
  );
}
export function ToastProvider({
  children,
  layout = "list",
  stackSize = 3,
  direction = "up",
}: {
  children: ReactNode;
  layout?: ToastLayout;
  stackSize?: number;
  direction?: ToastDirection;
}) {
  const [messages, setMessages] = useState<(ToastMessage & { id: string })[]>(
    [],
  );
  const viewportRef = useRef<HTMLOListElement>(null);
  const messageCountRef = useRef(0);
  messageCountRef.current = messages.length;
  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (event.key !== "F8") return;
      if (messageCountRef.current > 0) event.preventDefault();
      // Wait for the notification commit and Radix's focus guards before navigation.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (messageCountRef.current > 0) viewportRef.current?.focus();
        }),
      );
    };
    document.addEventListener("keydown", navigate);
    return () => document.removeEventListener("keydown", navigate);
  }, []);
  const [hasHover, setHasHover] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 900 : window.innerHeight,
  );
  useEffect(() => {
    const resize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const callbacks = useRef(new Map<string, (height: number) => void>());
  const layoutPositions = useRef(
    new Map<HTMLElement, { top: number; animation?: Animation }>(),
  );
  // Animate from the previous visual position even when viewport anchoring changes.
  useLayoutEffect(() => {
    const nodes = Array.from(
      viewportRef.current?.querySelectorAll<HTMLElement>(".gc-toast-slot") ||
        [],
    );
    const hasReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    for (const node of nodes) {
      const previous = layoutPositions.current.get(node);
      const translate = getComputedStyle(node).translate;
      const currentTranslation =
        translate === "none" ? 0 : parseFloat(translate.split(" ")[1] || "0");
      const targetTop = node.getBoundingClientRect().top - currentTranslation;
      if (previous && Math.abs(previous.top - targetTop) > 0.5) {
        const delta = previous.top + currentTranslation - targetTop;
        previous.animation?.cancel();
        const animation = hasReducedMotion
          ? undefined
          : node.animate(
              [{ translate: `0 ${delta}px` }, { translate: "0 0px" }],
              { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
            );
        layoutPositions.current.set(node, { top: targetTop, animation });
      } else if (!previous) {
        layoutPositions.current.set(node, { top: targetTop });
      }
    }
    for (const [node, position] of layoutPositions.current) {
      if (!nodes.includes(node)) {
        position.animation?.cancel();
        layoutPositions.current.delete(node);
      }
    }
  });

  const notify = useCallback(
    (message: ToastMessage) =>
      setMessages((current) => [
        ...current,
        { ...message, id: crypto.randomUUID() },
      ]),
    [],
  );
  const isExpanded = layout === "list" || hasHover || hasFocus;
  const limit = Number.isFinite(stackSize)
    ? Math.max(1, Math.floor(stackSize))
    : 3;
  const visible = layout === "stack" ? messages.slice(0, limit) : messages;
  function measured(id: string) {
    let callback = callbacks.current.get(id);
    if (!callback) {
      callback = (height) =>
        setHeights((current) =>
          current[id] === height ? current : { ...current, [id]: height },
        );
      callbacks.current.set(id, callback);
    }
    return callback;
  }
  const offsets: number[] = [];
  let stageHeight = 0;
  for (let index = 0; index < visible.length; index++) {
    const height = heights[visible[index].id] || 110;
    offsets[index] = isExpanded ? stageHeight : index * 10;
    stageHeight = isExpanded
      ? stageHeight + height + 12
      : (heights[visible[0].id] || 110) + index * 10;
  }
  if (isExpanded && visible.length) stageHeight -= 12;
  const canScroll = isExpanded && stageHeight + 32 > viewportHeight - 16;
  const ensureFocusedVisible = useCallback(() => {
    const viewport = viewportRef.current;
    const active = document.activeElement;
    if (
      viewport &&
      active instanceof HTMLElement &&
      viewport.contains(active) &&
      active !== viewport
    )
      active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);
  useLayoutEffect(() => {
    if (!hasFocus) return;
    const frame = requestAnimationFrame(ensureFocusedVisible);
    return () => cancelAnimationFrame(frame);
  }, [hasFocus, stageHeight, isExpanded, canScroll, ensureFocusedVisible]);
  return (
    <ToastContext.Provider value={notify}>
      <RToast.Provider duration={Infinity} swipeDirection="right" label="알림">
        {children}
        <RToast.Viewport
          ref={viewportRef}
          asChild
          label="알림 목록 · F8로 이동"
        >
          <div
            className="gc-toast-viewport"
            data-empty={messages.length === 0}
            data-layout={layout}
            data-can-scroll={canScroll}
            onTransitionEnd={ensureFocusedVisible}
            data-expanded={isExpanded}
            data-direction={direction}
            onPointerEnter={() => setHasHover(true)}
            onPointerLeave={() => setHasHover(false)}
            onFocusCapture={() => setHasFocus(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setHasFocus(false);
            }}
          >
            <div className="gc-toast-stage" style={{ height: stageHeight }}>
              {visible.map((message, index) => (
                <LiveToast
                  key={message.id}
                  message={message}
                  direction={direction}
                  index={index}
                  offset={offsets[index]}
                  isHidden={!isExpanded && index > 0}
                  onHeight={measured(message.id)}
                  collapsedHeight={heights[visible[0].id] || 110}
                  shouldAnchorTop={direction === "down" || canScroll}
                  onDismiss={() => {
                    callbacks.current.delete(message.id);
                    setMessages((current) =>
                      current.filter((item) => item.id !== message.id),
                    );
                    setHeights((current) => {
                      const next = { ...current };
                      delete next[message.id];
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          </div>
        </RToast.Viewport>
      </RToast.Provider>
    </ToastContext.Provider>
  );
}
export function ToastPreview({
  message,
  remainingRatio = 0.7,
  isPaused = false,
  onClose,
}: {
  message: ToastMessage;
  remainingRatio?: number;
  isPaused?: boolean;
  onClose?: () => void;
}) {
  return (
    <div
      className={`${classes(message)} gc-toast-preview`}
      aria-label="정적 알림 디자인 예시"
    >
      <ToastBody
        message={message}
        ratio={Math.max(0, Math.min(1, remainingRatio))}
        isPaused={isPaused}
        isPersistent={!Number.isFinite(duration(message))}
        isLive={false}
        onClose={onClose}
      />
    </div>
  );
}
