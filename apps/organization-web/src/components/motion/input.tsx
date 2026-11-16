"use client";
// Adapted from beui.dev/components/motion/input

import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export interface BeInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "defaultValue" | "onChange"
  > {
  label?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  error?: string | boolean;
  reserveErrorLine?: boolean;
  success?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  fieldClassName?: string;
}

export const BeInput = forwardRef<HTMLInputElement, BeInputProps>(
  function BeInput(
    {
      label,
      value: valueProp,
      defaultValue,
      onChange,
      onFocus,
      onBlur,
      error,
      reserveErrorLine = false,
      success,
      leftIcon,
      rightIcon,
      className = "",
      fieldClassName = "",
      disabled,
      id: idProp,
      type,
      ...rest
    },
    ref
  ) {
    const reactId = useId();
    const id = idProp ?? reactId;
    const reduce = useReducedMotion();

    const controlled = valueProp !== undefined;
    const [internal, setInternal] = useState(defaultValue ?? "");
    const value = controlled ? (valueProp ?? "") : internal;
    const [focused, setFocused] = useState(false);
    const fieldRef = useRef<HTMLDivElement>(null);

    const hasError = Boolean(error);
    const errorMessage = typeof error === "string" ? error : null;
    const rightSlot = success ? null : rightIcon;

    useEffect(() => {
      if (!fieldRef.current || reduce || !hasError) return;
      animate(
        fieldRef.current,
        { x: [0, -6, 6, -4, 4, -2, 0] },
        { duration: 0.45 }
      );
    }, [hasError, reduce]);

    const handleChange = (next: string) => {
      if (!controlled) setInternal(next);
      onChange?.(next);
    };

    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        {label ? (
          <label
            htmlFor={id}
            className="px-1 text-xs font-semibold text-neutral-700 dark:text-neutral-300"
          >
            {label}
          </label>
        ) : null}

        <div
          ref={fieldRef}
          className={`relative h-10 overflow-hidden rounded-xl border bg-white transition-colors duration-200 dark:bg-neutral-800 ${
            hasError
              ? "border-rose-500 ring-2 ring-rose-500/20"
              : focused
                ? "border-blue-600 ring-2 ring-blue-600/15 dark:border-blue-400"
                : "border-neutral-300 dark:border-neutral-700"
          } ${disabled ? "bg-neutral-100 opacity-70 dark:bg-neutral-800/60" : ""} ${fieldClassName}`}
        >
          {leftIcon ? (
            <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-neutral-400 [&_svg]:h-3.5 [&_svg]:w-3.5">
              {leftIcon}
            </span>
          ) : null}

          <input
            ref={ref}
            id={id}
            type={type}
            value={value}
            disabled={disabled}
            aria-invalid={hasError || undefined}
            aria-describedby={errorMessage ? `${id}-error` : undefined}
            {...rest}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            className={`h-full w-full bg-transparent text-xs text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-white ${
              leftIcon ? "pl-9" : "pl-3.5"
            } ${rightSlot || success ? "pr-9" : "pr-3.5"} ${
              disabled ? "cursor-not-allowed" : ""
            }`}
          />

          {success ? (
            <motion.svg
              viewBox="0 0 24 24"
              fill="none"
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600 dark:text-emerald-400"
            >
              <motion.path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            </motion.svg>
          ) : rightSlot ? (
            <span className="absolute right-0 top-0 flex h-full items-center pr-2.5 text-neutral-400 [&_svg]:h-3.5 [&_svg]:w-3.5">
              {rightSlot}
            </span>
          ) : null}
        </div>

        <div className={reserveErrorLine ? "min-h-4" : "contents"}>
          <AnimatePresence initial={false}>
            {errorMessage ? (
              <motion.p
                id={`${id}-error`}
                role="alert"
                initial={
                  reduce
                    ? { opacity: 0 }
                    : { opacity: 0, y: -4, filter: "blur(4px)" }
                }
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={
                  reduce
                    ? { opacity: 0 }
                    : { opacity: 0, y: -4, filter: "blur(4px)" }
                }
                transition={{ duration: 0.2 }}
                className="px-1 text-[11px] font-medium text-rose-600 dark:text-rose-400"
              >
                {errorMessage}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    );
  }
);
