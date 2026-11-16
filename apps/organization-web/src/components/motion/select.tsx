"use client";
// Adapted from beui.dev/components/motion/select (with createPortal)

import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface BeSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface BeSelectProps {
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: BeSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function BeSelect({
  label,
  value,
  onValueChange,
  options,
  placeholder = "Chọn...",
  disabled = false,
  className = "",
}: BeSelectProps) {
  const reduce = useReducedMotion() ?? false;
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    left: number;
    top: number;
    width: number;
    openUpward: boolean;
  } | null>(null);

  const selectedOption = options.find((o) => o.value === value);

  const updateCoords = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < 248 && rect.top > spaceBelow;
    setCoords({
      left: rect.left,
      top: openUpward ? rect.top - 6 : rect.bottom + 6,
      width: rect.width,
      openUpward,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
    const onScroll = (e: Event) => {
      if (contentRef.current && contentRef.current.contains(e.target as Node)) {
        return;
      }
      updateCoords();
    };
    window.addEventListener("resize", updateCoords);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, updateCoords]);

  useEffect(() => {
    if (!open) return;
    const isInside = (target: Node) =>
      rootRef.current?.contains(target) || contentRef.current?.contains(target);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!isInside(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative flex flex-col gap-1.5 ${className}`}>
      {label ? (
        <label
          htmlFor={`${baseId}-trigger`}
          className="px-1 text-xs font-semibold text-neutral-700 dark:text-neutral-300"
        >
          {label}
        </label>
      ) : null}

      <button
        ref={triggerRef}
        id={`${baseId}-trigger`}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-white px-3.5 text-left text-xs outline-none transition-colors dark:bg-neutral-800 ${
          open
            ? "border-blue-600 ring-2 ring-blue-600/15 dark:border-blue-400"
            : "border-neutral-300 hover:border-neutral-400 dark:border-neutral-700"
        } ${disabled ? "cursor-not-allowed bg-neutral-100 opacity-65 dark:bg-neutral-800/60" : ""}`}
      >
        <span
          className={`truncate font-medium ${
            selectedOption
              ? "text-neutral-900 dark:text-white"
              : "text-neutral-400"
          }`}
        >
          {selectedOption?.label ?? placeholder}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={
            reduce
              ? { duration: 0.1 }
              : { type: "spring", visualDuration: 0.2, bounce: 0.15 }
          }
          className="shrink-0 text-neutral-400"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.span>
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <motion.div
                ref={contentRef}
                role="listbox"
                initial={
                  reduce
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        y: coords.openUpward ? 6 : -6,
                        scaleY: 0.94,
                        filter: "blur(3px)",
                      }
                }
                animate={{ opacity: 1, y: 0, scaleY: 1, filter: "blur(0px)" }}
                exit={
                  reduce
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        y: coords.openUpward ? 4 : -4,
                        scaleY: 0.96,
                        filter: "blur(3px)",
                      }
                }
                transition={{ duration: 0.16, ease: EASE_OUT }}
                style={{
                  position: "fixed",
                  left: coords.left,
                  width: coords.width,
                  top: coords.openUpward ? undefined : coords.top,
                  bottom: coords.openUpward
                    ? window.innerHeight - coords.top
                    : undefined,
                  transformOrigin: coords.openUpward ? "bottom" : "top",
                }}
                className="z-[9999] max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 bg-white p-1 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
              >
                {options.map((opt) => {
                  const selected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={opt.disabled}
                      onClick={() => {
                        onValueChange(opt.value);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                        selected
                          ? "bg-neutral-100 font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-white"
                          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800/60 dark:hover:text-white"
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {selected && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                      )}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
