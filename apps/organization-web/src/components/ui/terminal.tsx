"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface TerminalProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export const Terminal = ({
  children,
  title = "pos-platform-cli",
  className,
}: TerminalProps) => {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-950 shadow-sm",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-neutral-700" />
          <div className="h-2.5 w-2.5 rounded-full bg-neutral-700" />
          <div className="h-2.5 w-2.5 rounded-full bg-neutral-700" />
        </div>
        <span className="font-mono text-[11px] text-neutral-400">{title}</span>
        <div className="w-8" />
      </div>
      <div className="p-4 font-mono text-xs leading-relaxed text-neutral-200 overflow-x-auto">
        {children}
      </div>
    </div>
  );
};
