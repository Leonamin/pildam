import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Tabs as RadixTabs } from "radix-ui";

export type TabsItem = {
  value: string;
  label: string;
  content: ReactNode;
  icon?: ReactNode;
  badge?: number | "dot";
  badgeMax?: 99 | 999;
  isDisabled?: boolean;
};
export type TabItem = TabsItem;
export type TabsVariant = "underline" | "adaptive" | "segmented" | "bottom";
export type TabsProps = {
  items: TabsItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  variant?: TabsVariant;
  label?: string;
};

function keepTabVisible(list: HTMLDivElement, target?: HTMLElement) {
  const focused = document.activeElement;
  const tab =
    target ??
    (focused instanceof HTMLElement &&
    list.contains(focused) &&
    focused.matches(".gc-tabs-trigger")
      ? focused
      : list.querySelector<HTMLElement>(
          '.gc-tabs-trigger[data-state="active"]',
        ));
  if (!tab) return;
  const viewport = list.getBoundingClientRect();
  const rect = tab.getBoundingClientRect();
  const clearance =
    parseFloat(
      getComputedStyle(list).getPropertyValue("--gc-focus-clearance"),
    ) || 6;
  if (rect.left < viewport.left + clearance)
    list.scrollLeft -= viewport.left + clearance - rect.left;
  else if (rect.right > viewport.right - clearance)
    list.scrollLeft += rect.right - (viewport.right - clearance);
}

function TabTrigger({
  item,
  isActive,
  variant,
}: {
  item: TabsItem;
  isActive: boolean;
  variant: NonNullable<TabsProps["variant"]>;
}) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [labelWidth, setLabelWidth] = useState(0);
  const isAdaptive = variant === "adaptive" && !!item.icon;
  const isIconBadge = variant === "bottom" && !!item.icon;
  const isDotBadge = item.badge === "dot";
  const badgeMax = item.badgeMax ?? 99;
  const hasBadge =
    isDotBadge || (typeof item.badge === "number" && item.badge > 0);
  const badgeLabel = isDotBadge
    ? ", 새 알림 있음"
    : hasBadge
      ? `, ${item.badge}개`
      : "";
  useEffect(() => {
    const element = measureRef.current;
    if (!element) return;
    const measure = () =>
      setLabelWidth(Math.ceil(element.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    let isSubscribed = true;
    document.fonts.ready.then(() => {
      if (isSubscribed) measure();
    });
    return () => {
      isSubscribed = false;
      observer.disconnect();
    };
  }, [isAdaptive, item.label, item.badge, item.badgeMax]);
  const badge = hasBadge ? (
    <span
      className={`gc-tabs-badge${isDotBadge ? " gc-tabs-badge-dot" : ""}`}
      aria-hidden="true"
    >
      {typeof item.badge === "number"
        ? item.badge > badgeMax
          ? `${badgeMax}+`
          : item.badge
        : null}
    </span>
  ) : null;
  return (
    <RadixTabs.Trigger
      value={item.value}
      disabled={item.isDisabled}
      aria-label={`${item.label}${badgeLabel}`}
      className={`gc-tabs-trigger ${isAdaptive ? "gc-tabs-has-adaptive-icon" : ""}`}
      style={{ "--gc-tab-label-width": `${labelWidth}px` } as CSSProperties}
    >
      {item.icon && (
        <span className="gc-tabs-icon" aria-hidden="true">
          {item.icon}
          {isIconBadge && badge}
        </span>
      )}
      <span
        className="gc-tabs-label"
        aria-hidden={isAdaptive && !isActive ? true : undefined}
      >
        <span>{item.label}</span>
        {!isIconBadge && badge}
      </span>
      {isAdaptive && (
        <span className="gc-tabs-measure-clip" aria-hidden="true">
          <span ref={measureRef} className="gc-tabs-measure">
            <span>{item.label}</span>
            {badge}
          </span>
        </span>
      )}
    </RadixTabs.Trigger>
  );
}

export function Tabs({
  items,
  defaultValue,
  value,
  onValueChange,
  variant = "underline",
  label = "콘텐츠 보기",
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(
    defaultValue ?? items.find((item) => !item.isDisabled)?.value ?? "",
  );
  const activeValue = value ?? internalValue;
  const triggerRefs = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const indicatorAnimationRef = useRef<Animation | null>(null);
  const previousSelectionRef = useRef(activeValue);
  useLayoutEffect(() => {
    const list = triggerRefs.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;
    const selected = list.querySelector<HTMLElement>(
      '.gc-tabs-trigger[data-state="active"]',
    );
    if (!selected) {
      indicator.style.visibility = "hidden";
      return;
    }
    const update = (shouldAnimate = false) => {
      const previous = indicator.getBoundingClientRect();
      const hasPosition = indicator.style.visibility === "visible";
      indicatorAnimationRef.current?.cancel();
      Object.assign(indicator.style, {
        left: `${selected.offsetLeft}px`,
        top: `${selected.offsetTop}px`,
        width: `${selected.getBoundingClientRect().width}px`,
        height: `${selected.getBoundingClientRect().height}px`,
        visibility: "visible",
      });
      if (
        !shouldAnimate ||
        !hasPosition ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        return;
      const next = indicator.getBoundingClientRect();
      const deltaX = previous.left - next.left;
      const deltaY = previous.top - next.top;
      const styles = getComputedStyle(list);
      const duration = styles.getPropertyValue("--gc-tab-transition").trim();
      const easing = styles.getPropertyValue("--gc-tab-easing").trim();
      indicatorAnimationRef.current = indicator.animate(
        [
          {
            transform: `translate(${deltaX}px, ${deltaY}px)`,
            width: `${previous.width}px`,
            offset: 0,
            easing,
          },
          {
            transform: `translate(${deltaX * 0.08}px, ${deltaY * 0.08}px)`,
            width: `${next.width + (previous.width - next.width) * 0.08}px`,
            offset: 0.65,
            easing,
          },
          { transform: "translate(0, 0)", width: `${next.width}px`, offset: 1 },
        ],
        {
          duration: parseFloat(duration) * (duration.endsWith("ms") ? 1 : 1000),
        },
      );
    };
    update(previousSelectionRef.current !== activeValue);
    previousSelectionRef.current = activeValue;
    const observer = new ResizeObserver(() => {
      // Initial observer delivery must not cancel a just-started keyframe animation.
      if (
        indicator.offsetLeft !== selected.offsetLeft ||
        indicator.offsetTop !== selected.offsetTop ||
        Math.abs(
          indicator.getBoundingClientRect().height -
            selected.getBoundingClientRect().height,
        ) > 0.5 ||
        Math.abs(
          parseFloat(indicator.style.width) -
            selected.getBoundingClientRect().width,
        ) > 0.5
      )
        update();
    });
    observer.observe(list);
    list
      .querySelectorAll(".gc-tabs-trigger")
      .forEach((trigger) => observer.observe(trigger));
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stopMotion = () => {
      if (motion.matches) indicatorAnimationRef.current?.cancel();
    };
    motion.addEventListener("change", stopMotion);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", stopMotion);
    };
  }, [activeValue, variant, items]);
  useEffect(() => () => indicatorAnimationRef.current?.cancel(), []);
  useLayoutEffect(() => {
    const root = triggerRefs.current;
    if (!root) return;
    keepTabVisible(root);
    // Adaptive siblings keep moving during expansion; follow the focused tab throughout.
    const observer = new ResizeObserver(() => keepTabVisible(root));
    observer.observe(root);
    root
      .querySelectorAll(".gc-tabs-trigger")
      .forEach((trigger) => observer.observe(trigger));
    return () => observer.disconnect();
  }, [activeValue, variant, items]);
  return (
    <RadixTabs.Root
      className={`gc-tabs gc-tabs-${variant}`}
      value={activeValue}
      onValueChange={(next) => {
        setInternalValue(next);
        onValueChange?.(next);
      }}
      activationMode="manual"
    >
      <RadixTabs.List
        ref={triggerRefs}
        className="gc-tabs-list"
        aria-label={label}
        onTransitionEnd={(event) => {
          if (event.propertyName !== "width") return;
          keepTabVisible(event.currentTarget);
        }}
        onFocusCapture={(event) => {
          if ((event.target as HTMLElement).matches(".gc-tabs-trigger"))
            keepTabVisible(event.currentTarget, event.target as HTMLElement);
        }}
      >
        {variant !== "adaptive" && (
          <span
            ref={indicatorRef}
            className="gc-tabs-indicator"
            aria-hidden="true"
          />
        )}
        {items.map((item) => (
          <TabTrigger
            key={item.value}
            item={item}
            isActive={item.value === activeValue}
            variant={variant}
          />
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content
          key={item.value}
          className="gc-tabs-panel"
          value={item.value}
        >
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
