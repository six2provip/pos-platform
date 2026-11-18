"use client";
// Adapted from beui.dev/components/motion/button

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BeButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type BeButtonSize = "sm" | "md" | "lg" | "icon";

export interface BeButtonProps
  extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: BeButtonVariant;
  size?: BeButtonSize;
  pressScale?: number;
  children?: ReactNode;
}

const SPRING_PRESS = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.6,
} as const;

const VARIANT_CLASS: Record<BeButtonVariant, string> = {
  primary:
    "bg-neutral-900 text-white shadow-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200",
  secondary:
    "border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800",
  ghost:
    "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white",
  outline:
    "border border-neutral-300 bg-transparent text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800",
  danger:
    "bg-rose-600 text-white shadow-sm hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500",
};

const SIZE_CLASS: Record<BeButtonSize, string> = {
  sm: "h-8 px-3.5 text-xs gap-1.5 rounded-full",
  md: "h-9 px-4 text-xs gap-1.5 rounded-full",
  lg: "h-10 px-5 text-sm gap-2 rounded-full",
  icon: "h-8 w-8 rounded-lg",
};

export const BeButton = forwardRef<HTMLButtonElement, BeButtonProps>(
  function BeButton(
    {
      variant = "primary",
      size = "md",
      pressScale = 0.96,
      className,
      children,
      type = "button",
      ...rest
    },
    ref
  ) {
    const reduce = useReducedMotion();

    return (
      <motion.button
        ref={ref}
        type={type}
        whileTap={reduce ? undefined : { scale: pressScale }}
        whileHover={reduce ? undefined : { scale: 1.015 }}
        transition={SPRING_PRESS}
        className={cn(
          "inline-flex items-center justify-center font-semibold select-none transition-colors",
          "disabled:pointer-events-none disabled:opacity-45",
          VARIANT_CLASS[variant],
          SIZE_CLASS[size],
          className
        )}
        {...rest}
      >
        {children}
      </motion.button>
    );
  }
);
