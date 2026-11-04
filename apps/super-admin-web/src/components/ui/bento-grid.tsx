"use client";

import React, { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface BentoGridProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  className?: string;
}

interface BentoCardProps extends ComponentPropsWithoutRef<"div"> {
  name: string;
  className?: string;
  background?: ReactNode;
  Icon: React.ElementType;
  iconColorClass?: string;
  description: string;
  cta?: string;
  onAction?: () => void;
  badge?: string;
  children?: ReactNode;
}

export const BentoGrid = ({ children, className, ...props }: BentoGridProps) => {
  return (
    <div
      className={cn(
        "grid w-full grid-cols-1 md:grid-cols-3 gap-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const BentoCard = ({
  name,
  className,
  background,
  Icon,
  iconColorClass = "text-rose-500",
  description,
  cta,
  onAction,
  badge,
  children,
  ...props
}: BentoCardProps) => (
  <div
    className={cn(
      "group relative flex flex-col justify-between overflow-hidden rounded-xl border border-neutral-200/80 bg-neutral-50/70 p-6 transition-all duration-200 hover:border-neutral-300 hover:bg-neutral-50",
      className
    )}
    {...props}
  >
    {background && (
      <div className="pointer-events-none absolute inset-0">{background}</div>
    )}
    <div className="relative z-10 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Icon className={cn("h-5 w-5 transition-transform duration-200 group-hover:scale-105", iconColorClass)} />
        {badge && (
          <span className="rounded-md bg-white border border-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-1">
        <h3 className="text-[15px] font-semibold text-neutral-900">{name}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">
          {description}
        </p>
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>

    {cta && onAction && (
      <div className="relative z-10 mt-4 pt-3 border-t border-neutral-200/70">
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-900 hover:text-neutral-600 transition-colors"
        >
          {cta}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    )}
  </div>
);
