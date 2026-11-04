"use client";

import React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface BorderBeamProps {
  className?: string;
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
}

export const BorderBeam = ({
  className,
  size = 90,
  duration = 6,
  delay = 0,
  colorFrom = "#6366f1",
  colorTo = "#22d3ee",
}: BorderBeamProps) => {
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden">
      <motion.div
        className={cn(
          "absolute top-0 left-0 h-[2px] rounded-full",
          className
        )}
        style={{
          width: size,
          background: `linear-gradient(90deg, transparent, ${colorFrom}, ${colorTo}, transparent)`,
        }}
        initial={{ left: "-25%", opacity: 0.9 }}
        animate={{ left: "110%" }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration: duration / 2,
          delay,
        }}
      />
      <motion.div
        className={cn(
          "absolute bottom-0 right-0 h-[2px] rounded-full",
          className
        )}
        style={{
          width: size,
          background: `linear-gradient(90deg, transparent, ${colorTo}, ${colorFrom}, transparent)`,
        }}
        initial={{ right: "-25%", opacity: 0.9 }}
        animate={{ right: "110%" }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration: duration / 2,
          delay: delay + duration / 4,
        }}
      />
    </div>
  );
};

