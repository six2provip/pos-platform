"use client";
// Adapted from beui.dev/components/motion/pagination

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { type ComponentPropsWithRef, useId, useState } from "react";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SPRING_LAYOUT = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.6,
} as const;

type PaginationItem = number | "ellipsis-start" | "ellipsis-end";

export function paginationRange(
  page: number,
  totalPages: number,
  siblings = 1,
  boundaries = 1
): PaginationItem[] {
  const range = (start: number, end: number) =>
    Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  const slots = boundaries * 2 + siblings * 2 + 3;
  if (totalPages <= slots) return range(1, totalPages);

  const left = Math.max(page - siblings, boundaries);
  const right = Math.min(page + siblings, totalPages - boundaries);
  const showStart = left > boundaries + 2;
  const showEnd = right < totalPages - (boundaries + 1);

  if (!showStart && showEnd) {
    return [
      ...range(1, siblings * 2 + boundaries + 2),
      "ellipsis-end",
      ...range(totalPages - boundaries + 1, totalPages),
    ];
  }
  if (showStart && !showEnd) {
    return [
      ...range(1, boundaries),
      "ellipsis-start",
      ...range(totalPages - (boundaries + 1 + siblings * 2), totalPages),
    ];
  }
  return [
    ...range(1, boundaries),
    "ellipsis-start",
    ...range(left, right),
    "ellipsis-end",
    ...range(totalPages - boundaries + 1, totalPages),
  ];
}

export interface AnimatedPaginationProps
  extends Omit<ComponentPropsWithRef<"nav">, "onChange" | "children"> {
  totalPages: number;
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  siblings?: number;
  boundaries?: number;
  jump?: number;
}

const CONTROL =
  "relative inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs tabular-nums outline-none transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.94] motion-reduce:active:scale-100";

export function AnimatedPagination({
  totalPages,
  page,
  defaultPage = 1,
  onPageChange,
  siblings = 1,
  boundaries = 1,
  jump = 5,
  className = "",
  ...props
}: AnimatedPaginationProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const total = Math.max(1, Math.floor(totalPages));
  const clamp = (value: number) => Math.min(total, Math.max(1, Math.round(value)));
  const [internal, setInternal] = useState(() => clamp(defaultPage));
  const current = clamp(page ?? internal);

  const go = (next: number) => {
    const target = clamp(next);
    if (target === current) return;
    if (page === undefined) setInternal(target);
    onPageChange?.(target);
  };

  const items = paginationRange(current, total, siblings, boundaries);
  const fade = { duration: reduce ? 0.12 : 0.16, ease: EASE_OUT };

  return (
    <nav
      {...props}
      aria-label="Phân trang"
      className={`flex items-center ${className}`}
    >
      <LayoutGroup id={id}>
        <ul className="relative flex items-center gap-1">
          <li>
            <button
              type="button"
              aria-label="Trang trước"
              disabled={current === 1}
              onClick={() => go(current - 1)}
              className={`${CONTROL} text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-35 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </li>

          <AnimatePresence mode="popLayout" initial={false}>
            {items.map((item) => {
              if (typeof item !== "number") {
                const back = item === "ellipsis-start";
                const Chevrons = back ? ChevronsLeft : ChevronsRight;
                return (
                  <motion.li
                    key={item}
                    layout={reduce ? false : "position"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: fade }}
                    transition={{ layout: SPRING_LAYOUT, opacity: fade }}
                  >
                    <button
                      type="button"
                      aria-label={back ? `Lùi ${jump} trang` : `Tiến ${jump} trang`}
                      onClick={() => go(current + (back ? -jump : jump))}
                      className={`${CONTROL} group text-neutral-400 hover:text-neutral-900 dark:hover:text-white`}
                    >
                      <span className="transition-all duration-150 group-hover:scale-75 group-hover:opacity-0">
                        …
                      </span>
                      <Chevrons className="absolute h-3.5 w-3.5 scale-75 opacity-0 transition-all duration-150 group-hover:scale-100 group-hover:opacity-100" />
                    </button>
                  </motion.li>
                );
              }

              const isCurrent = item === current;
              return (
                <motion.li
                  key={item}
                  layout={reduce ? false : "position"}
                  initial={{ opacity: 0, scale: reduce ? 1 : 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: reduce ? 1 : 0.8, transition: fade }}
                  transition={{ layout: SPRING_LAYOUT, opacity: fade, scale: SPRING_LAYOUT }}
                >
                  <button
                    type="button"
                    aria-label={`Trang ${item}`}
                    aria-current={isCurrent ? "page" : undefined}
                    onClick={() => go(item)}
                    className={`${CONTROL} ${
                      isCurrent
                        ? "font-bold text-white dark:text-neutral-900"
                        : "font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
                    }`}
                  >
                    {isCurrent && (
                      <motion.span
                        aria-hidden="true"
                        layoutId={reduce ? undefined : `pagination-current-${id}`}
                        transition={SPRING_LAYOUT}
                        className="absolute inset-0 rounded-full bg-neutral-900 shadow-sm dark:bg-white"
                      />
                    )}
                    <span className="relative">{item}</span>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>

          <li>
            <button
              type="button"
              aria-label="Trang sau"
              disabled={current === total}
              onClick={() => go(current + 1)}
              className={`${CONTROL} text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-35 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </li>
        </ul>
      </LayoutGroup>
    </nav>
  );
}
