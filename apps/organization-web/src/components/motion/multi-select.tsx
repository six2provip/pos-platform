"use client";
// Adapted from beui.dev/components/motion/multi-select (with createPortal)

import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface BeMultiSelectOption {
  value: string;
  label: string;
}

export interface BeMultiSelectProps {
  label?: string;
  helperText?: string;
  options: BeMultiSelectOption[];
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SPRING_LAYOUT = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.6,
} as const;
const SPRING_SWAP = {
  type: "spring",
  stiffness: 460,
  damping: 30,
  mass: 0.55,
} as const;

export function BeMultiSelect({
  label,
  helperText,
  options,
  values,
  onChange,
  placeholder = "Tìm hoặc chọn danh mục...",
  emptyText = "Không tìm thấy danh mục phù hợp.",
  className = "",
}: BeMultiSelectProps) {
  const reduce = useReducedMotion() ?? false;
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{
    left: number;
    top: number;
    width: number;
    openUpward: boolean;
  } | null>(null);

  const updateCoords = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < 240 && rect.top > spaceBelow;
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
    window.addEventListener("resize", updateCoords);
    window.addEventListener("scroll", updateCoords, true);
    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", updateCoords, true);
    };
  }, [open, values.length, updateCoords]);

  useEffect(() => {
    if (!open) return;
    const isInside = (target: Node) =>
      rootRef.current?.contains(target) || contentRef.current?.contains(target);
    const onPointerDown = (e: PointerEvent) => {
      if (!isInside(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const optionMap = useMemo(
    () => new Map(options.map((o) => [o.value, o.label])),
    [options]
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const toggleValue = (val: string) => {
    if (values.includes(val)) {
      onChange(values.filter((v) => v !== val));
    } else {
      onChange([...values, val]);
    }
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  return (
    <div ref={rootRef} className={`relative flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2 px-1">
        <div>
          {label ? (
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              {label}
            </span>
          ) : null}
          {helperText ? (
            <p className="text-[11px] text-neutral-400">{helperText}</p>
          ) : null}
        </div>
        {values.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            Bỏ chọn ({values.length})
          </button>
        )}
      </div>

      {/* Multi-Select Token Trigger */}
      <div
        ref={triggerRef}
        onPointerDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("[data-token-remove]")) return;
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className={`relative flex min-h-11 w-full cursor-text flex-wrap items-center gap-1.5 rounded-xl border bg-white px-2.5 py-1.5 transition-colors dark:bg-neutral-800 ${
          open
            ? "border-blue-600 ring-2 ring-blue-600/15 dark:border-blue-400"
            : "border-neutral-300 hover:border-neutral-400 dark:border-neutral-700"
        }`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <AnimatePresence initial={false} mode="popLayout">
            {values.map((val) => {
              const itemLabel = optionMap.get(val) ?? val;
              return (
                <motion.span
                  key={`token-${val}`}
                  layout={reduce ? false : "position"}
                  initial={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, y: 5, scale: 0.92 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={
                    reduce
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          clipPath: "inset(0 0 0 100% round 0.5rem)",
                          transition: { duration: 0.14, ease: EASE_OUT },
                        }
                  }
                  transition={
                    reduce
                      ? { duration: 0.1 }
                      : { layout: SPRING_LAYOUT, transform: SPRING_SWAP }
                  }
                  className="inline-flex h-7 max-w-[180px] items-center gap-1 rounded-lg bg-neutral-900 px-2 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
                >
                  <span className="truncate">{itemLabel}</span>
                  <button
                    type="button"
                    data-token-remove=""
                    aria-label={`Gỡ ${itemLabel}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(values.filter((v) => v !== val));
                    }}
                    className="-mr-0.5 grid h-4 w-4 shrink-0 place-items-center rounded text-white/75 hover:bg-white/20 hover:text-white dark:text-neutral-900/75 dark:hover:bg-neutral-900/15 dark:hover:text-neutral-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </motion.span>
              );
            })}
          </AnimatePresence>

          <div className="flex min-w-[120px] flex-1 items-center gap-1.5 pl-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
            <input
              ref={inputRef}
              id={`${baseId}-input`}
              type="text"
              value={query}
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setOpen(true);
                setQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !query && values.length > 0) {
                  onChange(values.slice(0, -1));
                }
              }}
              placeholder={values.length === 0 ? placeholder : "Tìm thêm..."}
              className="h-7 w-full bg-transparent text-xs text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-white"
            />
          </div>
        </div>

        <ChevronsUpDown className="h-4 w-4 shrink-0 text-neutral-400" />
      </div>

      {/* Portal Searchable Dropdown List (Never clipped by overflow containers) */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <motion.div
                ref={contentRef}
                initial={
                  reduce
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        y: coords.openUpward ? 6 : -6,
                        scale: 0.98,
                        filter: "blur(3px)",
                      }
                }
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={
                  reduce
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        y: coords.openUpward ? 4 : -4,
                        scale: 0.98,
                        filter: "blur(3px)",
                      }
                }
                transition={{
                  type: "spring",
                  duration: 0.28,
                  bounce: 0.14,
                }}
                style={{
                  position: "fixed",
                  left: coords.left,
                  width: coords.width,
                  top: coords.openUpward ? undefined : coords.top,
                  bottom: coords.openUpward
                    ? window.innerHeight - coords.top
                    : undefined,
                }}
                className="z-[9999] max-h-60 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
              >
                {filteredOptions.length === 0 ? (
                  <div className="py-5 text-center text-xs text-neutral-400">
                    {emptyText}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {filteredOptions.map((opt) => {
                      const selected = values.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => toggleValue(opt.value)}
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
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
