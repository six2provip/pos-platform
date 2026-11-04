"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { cn } from "@/lib/utils";

interface RippleButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  rippleColor?: string;
  duration?: string;
}

type RippleItem = {
  x: number;
  y: number;
  size: number;
  key: number;
};

function ButtonRipple({
  ripple,
  duration,
  rippleColor,
  onDone,
}: {
  ripple: RippleItem;
  duration: string;
  rippleColor: string;
  onDone: (key: number) => void;
}) {
  useEffect(() => {
    const timeout = setTimeout(
      () => {
        onDone(ripple.key);
      },
      parseInt(duration, 10)
    );
    return () => clearTimeout(timeout);
  }, [duration, onDone, ripple.key]);

  return (
    <span
      className="animate-rippling pointer-events-none absolute rounded-full opacity-25"
      style={
        {
          width: `${ripple.size}px`,
          height: `${ripple.size}px`,
          top: `${ripple.y}px`,
          left: `${ripple.x}px`,
          backgroundColor: rippleColor,
          transform: "scale(0)",
          "--duration": duration,
        } as React.CSSProperties
      }
    />
  );
}

export const RippleButton = React.forwardRef<
  HTMLButtonElement,
  RippleButtonProps
>(
  (
    {
      className,
      children,
      rippleColor = "#9ca3af",
      duration = "500ms",
      onClick,
      ...props
    },
    ref
  ) => {
    const [buttonRipples, setButtonRipples] = useState<Array<RippleItem>>([]);
    const nextKeyRef = useRef(0);

    const removeRipple = useCallback((key: number) => {
      setButtonRipples((prev) => prev.filter((r) => r.key !== key));
    }, []);

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = event.clientX - rect.left - size / 2;
      const y = event.clientY - rect.top - size / 2;

      nextKeyRef.current += 1;
      const newRipple = { x, y, size, key: nextKeyRef.current };
      setButtonRipples((prev) => [...prev, newRipple]);
      onClick?.(event);
    };

    return (
      <button
        className={cn(
          "relative inline-flex cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-800 transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50",
          className
        )}
        onClick={handleClick}
        ref={ref}
        {...props}
      >
        <div className="relative z-10 flex items-center gap-1.5">{children}</div>
        <span className="pointer-events-none absolute inset-0">
          {buttonRipples.map((ripple) => (
            <ButtonRipple
              key={ripple.key}
              duration={duration}
              onDone={removeRipple}
              ripple={ripple}
              rippleColor={rippleColor}
            />
          ))}
        </span>
      </button>
    );
  }
);

RippleButton.displayName = "RippleButton";
