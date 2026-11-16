"use client";
// Adapted from beui.dev/components/motion/switch

import { animate, motion, MotionConfig, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

const THUMB_SPRING = {
  type: "spring",
  stiffness: 800,
  damping: 80,
  mass: 4,
} as const;

export interface BeSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
  className?: string;
}

export function BeSwitch({
  checked,
  onCheckedChange,
  disabled,
  label,
  ariaLabel,
  className = "",
}: BeSwitchProps) {
  const id = useId();
  const thumbRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [isPressed, setIsPressed] = useState(false);

  useEffect(() => {
    if (!thumbRef.current || reduce) return;
    if (disabled && isPressed) {
      animate(
        thumbRef.current,
        { x: [0, -2, 2, -1, 0] },
        { delay: 0.2, duration: 0.6 }
      );
    }
  }, [disabled, isPressed, reduce]);

  const squish = !disabled && isPressed && !reduce;

  return (
    <MotionConfig transition={reduce ? { duration: 0 } : THUMB_SPRING}>
      <span className={`inline-flex items-center justify-between gap-3 ${className}`}>
        {label ? (
          <label
            htmlFor={id}
            className="cursor-pointer text-xs font-semibold text-neutral-700 dark:text-neutral-300"
          >
            {label}
          </label>
        ) : null}
        <motion.button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={ariaLabel || label}
          disabled={disabled}
          onClick={() => !disabled && onCheckedChange(!checked)}
          onPointerDown={() => setIsPressed(true)}
          onPointerUp={() => setIsPressed(false)}
          onPointerLeave={() => setIsPressed(false)}
          initial={false}
          className={`group inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full px-0.5 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-blue-600/30 disabled:cursor-not-allowed disabled:opacity-60 ${
            checked
              ? "justify-end bg-neutral-900 dark:bg-white"
              : "justify-start bg-neutral-300 dark:bg-neutral-700"
          }`}
        >
          <motion.div
            ref={thumbRef}
            layout
            animate={{ scale: squish ? 0.9 : 1 }}
            className={`pointer-events-none block h-5 w-5 rounded-full shadow-md ${
              checked
                ? "bg-white dark:bg-neutral-900"
                : "bg-white dark:bg-neutral-200"
            }`}
          />
        </motion.button>
      </span>
    </MotionConfig>
  );
}
