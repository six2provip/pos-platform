"use client";
// Adapted from beui.dev/components/blocks/overflow-actions

import { MoreHorizontal, X } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
  type Variants,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type OverflowActionsSize = "sm" | "md";

export type OverflowActionItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  variant?: "default" | "primary" | "danger";
};

export interface OverflowActionsProps {
  primaryActions: OverflowActionItem[];
  overflowActions: OverflowActionItem[];
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onAction?: (item: OverflowActionItem) => void;
  collapseOnAction?: boolean;
  size?: OverflowActionsSize;
  openLabel?: string;
  closeLabel?: string;
  className?: string;
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const SHELL_TRANSITION: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 17,
  mass: 0.85,
};

const ICON_VARIANTS: Variants = {
  hidden: { opacity: 0, filter: "blur(3px)" },
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: 0.18, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    filter: "blur(3px)",
    transition: { duration: 0.18, ease: EASE_OUT },
  },
};

const OVERFLOW_ACTION_VARIANTS: Variants = {
  hidden: { opacity: 0, filter: "blur(4px)" },
  visible: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(4px)" },
};

const TRACK_SIZE_CLASS: Record<OverflowActionsSize, string> = {
  sm: "gap-1 p-1 text-xs",
  md: "gap-1.5 p-1.5 text-xs",
};

const GROUP_GAP_CLASS: Record<OverflowActionsSize, string> = {
  sm: "gap-1",
  md: "gap-1.5",
};

const ACTION_SIZE_CLASS: Record<OverflowActionsSize, string> = {
  sm: "h-8 min-w-8 gap-1.5 px-3",
  md: "h-9 min-w-9 gap-2 px-4",
};

const TOGGLE_SIZE_CLASS: Record<OverflowActionsSize, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
};

const ICON_SIZE_CLASS: Record<OverflowActionsSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

function useHoverCapable() {
  const [canHover, setCanHover] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHover(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return canHover;
}

function useControllableExpanded({
  expanded,
  defaultExpanded,
  onExpandedChange,
}: {
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [internalExpanded, setInternalExpanded] = useState(
    defaultExpanded ?? false
  );
  const isControlled = expanded !== undefined;
  const value = expanded ?? internalExpanded;

  const setValue = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalExpanded(next);
      onExpandedChange?.(next);
    },
    [isControlled, onExpandedChange]
  );

  return [value, setValue] as const;
}

export function OverflowActions({
  primaryActions,
  overflowActions,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  onAction,
  collapseOnAction = true,
  size = "md",
  openLabel = "Mở thêm thao tác",
  closeLabel = "Thu gọn thao tác",
  className = "",
}: OverflowActionsProps) {
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  const overflowId = useId();
  const overflowWrapperRef = useRef<HTMLDivElement>(null);
  const overflowWrapperLeftRef = useRef(0);
  const [isExpanded, setIsExpanded] = useControllableExpanded({
    expanded,
    defaultExpanded,
    onExpandedChange,
  });

  const transition = reduce ? { duration: 0 } : SHELL_TRANSITION;
  const toggleLabel = isExpanded ? closeLabel : openLabel;

  useLayoutEffect(() => {
    const overflowNode = overflowWrapperRef.current;
    if (!overflowNode) return;

    if (!isExpanded) {
      overflowNode.style.left = `${
        overflowWrapperLeftRef.current -
        overflowNode.getBoundingClientRect().left
      }px`;
      return;
    }

    overflowNode.style.left = "";
    overflowWrapperLeftRef.current = overflowNode.getBoundingClientRect().left;
  }, [isExpanded]);

  const handleAction = (item: OverflowActionItem) => {
    item.onClick?.();
    onAction?.(item);
    if (collapseOnAction) setIsExpanded(false);
  };

  return (
    <motion.div
      layout
      transition={transition}
      className={`inline-flex ${className}`}
    >
      <motion.div
        layout
        transition={transition}
        className={`relative inline-flex items-center overflow-hidden rounded-full border border-neutral-200/90 bg-neutral-900/95 shadow-2xl backdrop-blur-md dark:border-neutral-700 dark:bg-neutral-900/95 ${TRACK_SIZE_CLASS[size]}`}
      >
        <motion.div
          layout
          transition={transition}
          className={`inline-flex items-center ${GROUP_GAP_CLASS[size]}`}
        >
          {primaryActions.map((item) => (
            <ActionButton
              key={item.id}
              item={item}
              size={size}
              reduce={reduce}
              canHover={canHover}
              onAction={handleAction}
              layoutTransition={transition}
            />
          ))}
        </motion.div>

        <AnimatePresence mode="popLayout" initial={false}>
          {isExpanded && overflowActions.length > 0 ? (
            <motion.div
              key="overflow-actions"
              ref={overflowWrapperRef}
              id={overflowId}
              layout
              aria-hidden={!isExpanded}
              transition={transition}
              className={`relative inline-flex w-max items-center ${GROUP_GAP_CLASS[size]}`}
            >
              {overflowActions.map((item) => (
                <ActionButton
                  key={item.id}
                  item={item}
                  size={size}
                  reduce={reduce}
                  canHover={canHover}
                  overflow
                  visible={isExpanded}
                  variants={OVERFLOW_ACTION_VARIANTS}
                  onAction={handleAction}
                  layoutTransition={transition}
                />
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {overflowActions.length > 0 && (
          <motion.button
            type="button"
            layout
            aria-expanded={isExpanded}
            aria-controls={isExpanded ? overflowId : undefined}
            aria-label={toggleLabel}
            title={toggleLabel}
            onClick={() => setIsExpanded(!isExpanded)}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            whileHover={reduce || !canHover ? undefined : { scale: 1.04 }}
            transition={transition}
            className={`relative inline-grid shrink-0 place-items-center rounded-full bg-blue-600 text-white shadow-sm outline-none hover:bg-blue-500 disabled:pointer-events-none disabled:opacity-50 ${TOGGLE_SIZE_CLASS[size]}`}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={isExpanded ? "close" : "open"}
                variants={ICON_VARIANTS}
                initial={reduce ? { opacity: 0 } : "hidden"}
                animate={reduce ? { opacity: 1 } : "visible"}
                exit={reduce ? { opacity: 0 } : "exit"}
                className="inline-grid place-items-center"
              >
                {isExpanded ? (
                  <X className={ICON_SIZE_CLASS[size]} />
                ) : (
                  <MoreHorizontal className={ICON_SIZE_CLASS[size]} />
                )}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}

function ActionButton({
  item,
  size,
  reduce,
  canHover,
  overflow,
  visible = true,
  variants,
  onAction,
  layoutTransition,
}: {
  item: OverflowActionItem;
  size: OverflowActionsSize;
  reduce: boolean | null;
  canHover: boolean;
  overflow?: boolean;
  visible?: boolean;
  variants?: Variants;
  onAction: (item: OverflowActionItem) => void;
  layoutTransition: Transition;
}) {
  const label = typeof item.label === "string" ? item.label : undefined;

  const variantCls =
    item.variant === "primary"
      ? "bg-white text-neutral-900 font-bold hover:bg-neutral-100"
      : item.variant === "danger"
        ? "bg-rose-500/20 text-rose-200 font-semibold hover:bg-rose-500/30"
        : "bg-white/10 text-white font-semibold hover:bg-white/20";

  return (
    <motion.span
      layout="position"
      variants={variants}
      initial={variants ? (reduce ? { opacity: 0 } : "hidden") : undefined}
      animate={variants ? (reduce ? { opacity: 1 } : "visible") : undefined}
      exit={variants ? (reduce ? { opacity: 0 } : "exit") : undefined}
      whileTap={reduce || item.disabled ? undefined : { scale: 0.97 }}
      whileHover={
        reduce || !canHover || item.disabled ? undefined : { scale: 1.015 }
      }
      transition={layoutTransition}
      className="inline-flex shrink-0"
    >
      <button
        type="button"
        disabled={item.disabled}
        aria-label={item.ariaLabel}
        tabIndex={overflow && !visible ? -1 : undefined}
        title={label}
        onClick={() => onAction(item)}
        className={`inline-flex shrink-0 items-center justify-center rounded-full outline-none transition-colors disabled:pointer-events-none disabled:opacity-45 ${ACTION_SIZE_CLASS[size]} ${variantCls}`}
      >
        {item.icon ? (
          <span
            className={`inline-flex shrink-0 items-center justify-center ${ICON_SIZE_CLASS[size]}`}
          >
            {item.icon}
          </span>
        ) : null}
        <span className="whitespace-nowrap">{item.label}</span>
      </button>
    </motion.span>
  );
}
