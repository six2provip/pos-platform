"use client";
// Adapted from beui.dev/components/motion/theme-toggle (circle-blur View Transition)

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { type ComponentPropsWithoutRef, useCallback, useEffect, useState } from "react";

export type ThemeVariant = "rectangle" | "circle" | "circle-blur" | "blinds";

export type RectStart =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "bottom-up";

const VT_STYLE_ID = "beui-theme-toggle-vt";
const THEME_STORAGE_KEY = "pos_ui_theme";

const VT_CSS = `
html[data-beui-vt="rect"]::view-transition-old(root) {
  animation: none;
  mix-blend-mode: normal;
}
html[data-beui-vt="rect"]::view-transition-new(root) {
  mix-blend-mode: normal;
  animation: beui-rect-reveal 400ms ease-out;
}
html[data-beui-vt="circle"]::view-transition-old(root),
html[data-beui-vt="circle-blur"]::view-transition-old(root) {
  animation: none;
  mix-blend-mode: normal;
}
html[data-beui-vt="circle"]::view-transition-new(root) {
  mix-blend-mode: normal;
  animation: beui-circle-reveal 700ms cubic-bezier(0.4, 0, 0.2, 1);
}
html[data-beui-vt="circle-blur"]::view-transition-new(root) {
  mix-blend-mode: normal;
  animation: beui-circle-blur-reveal 700ms cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes beui-rect-reveal {
  from { clip-path: var(--beui-vt-from, inset(100% 0 0 0)); }
  to   { clip-path: inset(0 0 0 0); }
}
@keyframes beui-circle-reveal {
  from { clip-path: circle(0% at var(--beui-vt-origin, 50% 100%)); }
  to   { clip-path: circle(150% at var(--beui-vt-origin, 50% 100%)); }
}
@keyframes beui-circle-blur-reveal {
  from { clip-path: circle(0% at var(--beui-vt-origin, 50% 100%)); filter: blur(8px); }
  to   { clip-path: circle(150% at var(--beui-vt-origin, 50% 100%)); filter: blur(0px); }
}
`;

const CIRCLE_ORIGIN: Record<RectStart, string> = {
  "top-left": "0% 0%",
  "top-right": "100% 0%",
  "bottom-left": "0% 100%",
  "bottom-right": "100% 100%",
  center: "50% 50%",
  "bottom-up": "50% 100%",
};

export function useThemeToggle({
  variant = "circle-blur",
  start = "bottom-left",
}: { variant?: ThemeVariant; start?: RectStart } = {}) {
  const reduce = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      const dark = saved === "dark" || document.documentElement.classList.contains("dark");
      document.documentElement.classList.toggle("dark", dark);
      setIsDark(dark);
    }
    if (!document.getElementById(VT_STYLE_ID)) {
      const el = document.createElement("style");
      el.id = VT_STYLE_ID;
      el.textContent = VT_CSS;
      document.head.appendChild(el);
    }
  }, []);

  const applyTheme = useCallback(
    (nextDark: boolean) => {
      const applyDom = () => {
        document.documentElement.classList.toggle("dark", nextDark);
        localStorage.setItem(THEME_STORAGE_KEY, nextDark ? "dark" : "light");
        setIsDark(nextDark);
        window.dispatchEvent(new CustomEvent("pos-theme-change", { detail: { isDark: nextDark } }));
      };

      if (reduce || typeof document === "undefined" || !("startViewTransition" in document)) {
        applyDom();
        return;
      }

      const root = document.documentElement;
      root.style.setProperty("--beui-vt-origin", CIRCLE_ORIGIN[start]);
      root.dataset.beuiVt = variant;

      const vt = (
        document as Document & {
          startViewTransition(cb: () => void): { finished: Promise<void> };
        }
      ).startViewTransition(applyDom);

      vt.finished.finally(() => {
        delete root.dataset.beuiVt;
      });
    },
    [reduce, start, variant]
  );

  // Sync across multiple ThemeToggle instances on the same page
  useEffect(() => {
    const onSync = (ev: Event) => {
      const detail = (ev as CustomEvent<{ isDark: boolean }>).detail;
      if (detail && typeof detail.isDark === "boolean") {
        setIsDark(detail.isDark);
      }
    };
    window.addEventListener("pos-theme-change", onSync);
    return () => window.removeEventListener("pos-theme-change", onSync);
  }, []);

  const toggle = useCallback(() => {
    applyTheme(!isDark);
  }, [applyTheme, isDark]);

  return { isDark, mounted, toggle, setDark: applyTheme };
}

export interface ThemeToggleProps
  extends Omit<ComponentPropsWithoutRef<"button">, "children" | "onClick"> {
  variant?: ThemeVariant;
  start?: RectStart;
  iconClassName?: string;
}

export function ThemeToggle({
  variant = "circle-blur",
  start = "top-right",
  className = "",
  iconClassName = "h-4 w-4",
  ...rest
}: ThemeToggleProps) {
  const { isDark, mounted, toggle } = useThemeToggle({ variant, start });

  return (
    <button
      type="button"
      aria-label={mounted && isDark ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
      title={mounted && isDark ? "Giao diện Sáng" : "Giao diện Tối"}
      onClick={toggle}
      className={`inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white p-2 text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 ${className}`}
      {...rest}
    >
      {mounted ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isDark ? "dark" : "light"}
            initial={{ opacity: 0, scale: 0.4, filter: "blur(3px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.4, filter: "blur(3px)" }}
            transition={{ duration: 0.18 }}
            className="inline-flex items-center justify-center"
          >
            {isDark ? <Sun className={iconClassName} /> : <Moon className={iconClassName} />}
          </motion.span>
        </AnimatePresence>
      ) : (
        <span className={iconClassName} aria-hidden="true" />
      )}
    </button>
  );
}

/** Pill Light | Dark switcher powered by beUI Circle Blur View Transition */
export function ThemeSegmentedToggle({ start = "bottom-left" }: { start?: RectStart }) {
  const { isDark, mounted, setDark } = useThemeToggle({ variant: "circle-blur", start });

  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-neutral-200/80 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-800/80">
      <button
        type="button"
        onClick={() => mounted && isDark && setDark(false)}
        className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
          !mounted || !isDark
            ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-white"
            : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        }`}
      >
        <Sun className="h-3.5 w-3.5" />
        Sáng
      </button>
      <button
        type="button"
        onClick={() => mounted && !isDark && setDark(true)}
        className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
          mounted && isDark
            ? "bg-neutral-900 text-white shadow-sm dark:bg-neutral-950 dark:text-white"
            : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        }`}
      >
        <Moon className="h-3.5 w-3.5" />
        Tối
      </button>
    </div>
  );
}
