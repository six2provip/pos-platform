"use client";
// Adapted from beui.dev/components/motion/tabs

import { motion, MotionConfig, useReducedMotion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type Variant = "pill" | "segment" | "underline";

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
  layoutId: string;
  variant: Variant;
}

const TabsCtx = createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = useContext(TabsCtx);
  if (!ctx) throw new Error("BeTabs.* must be used inside <BeTabs>");
  return ctx;
}

const SPRING_TAB = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.7,
} as const;

export function BeTabs({
  defaultValue,
  value,
  onValueChange,
  variant = "pill",
  children,
  className,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const layoutId = useId();
  const reduce = useReducedMotion();
  const controlled = value !== undefined;
  const current = controlled ? value : internal;

  const setValue = useCallback(
    (v: string) => {
      if (!controlled) setInternal(v);
      onValueChange?.(v);
    },
    [controlled, onValueChange]
  );

  const ctxValue = useMemo(
    () => ({ value: current, setValue, layoutId, variant }),
    [current, setValue, layoutId, variant]
  );

  return (
    <MotionConfig transition={reduce ? { duration: 0 } : SPRING_TAB}>
      <TabsCtx.Provider value={ctxValue}>
        <motion.div layoutRoot className={className}>
          {children}
        </motion.div>
      </TabsCtx.Provider>
    </MotionConfig>
  );
}

const listClasses: Record<Variant, string> = {
  pill: "inline-flex items-center gap-1 rounded-full bg-neutral-100 p-1 dark:bg-neutral-800/90",
  segment:
    "inline-flex items-center gap-0.5 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800/90",
  underline:
    "inline-flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-800",
};

export function BeTabsList({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { variant } = useTabs();
  return (
    <div
      role="tablist"
      className={cn(listClasses[variant], className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function BeTabsTrigger({
  value,
  icon,
  children,
  className,
  indicatorClassName,
  onClick,
  ...props
}: {
  value: string;
  icon?: ReactNode;
  indicatorClassName?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value">) {
  const { value: current, setValue, layoutId, variant } = useTabs();
  const active = current === value;

  if (variant === "underline") {
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={(e) => {
          onClick?.(e);
          if (!e.defaultPrevented) setValue(value);
        }}
        className={cn(
          "relative inline-flex items-center gap-1.5 px-3 pb-2.5 pt-1.5 text-xs font-semibold transition-colors",
          active
            ? "text-neutral-900 dark:text-white"
            : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200",
          className
        )}
        {...props}
      >
        {icon}
        {children}
        {active && (
          <motion.span
            layoutId={layoutId}
            className={cn(
              "absolute inset-x-0 -bottom-px h-0.5 bg-neutral-900 dark:bg-white",
              indicatorClassName
            )}
          />
        )}
      </button>
    );
  }

  const radius = variant === "pill" ? "rounded-full" : "rounded-lg";

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) setValue(value);
      }}
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-3.5 py-1.5 text-xs font-semibold transition-colors outline-none",
        radius,
        active
          ? "text-white dark:text-neutral-900"
          : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white",
        className
      )}
      {...props}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          className={cn(
            "absolute inset-0 bg-neutral-900 shadow-sm dark:bg-white",
            radius,
            indicatorClassName
          )}
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1.5">
        {icon}
        {children}
      </span>
    </button>
  );
}

