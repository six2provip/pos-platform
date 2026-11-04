"use client";

import React, { type ComponentPropsWithoutRef } from "react";
import { AnimatePresence, motion, type MotionProps } from "motion/react";
import { cn } from "@/lib/utils";

export function AnimatedListItem({ children }: { children: React.ReactNode }) {
  const animations: MotionProps = {
    initial: { scale: 0.96, opacity: 0, y: -8 },
    animate: { scale: 1, opacity: 1, y: 0, originY: 0 },
    exit: { scale: 0.96, opacity: 0, y: 8 },
    transition: { type: "spring", stiffness: 320, damping: 32 },
  };

  return (
    <motion.div {...animations} layout className="w-full">
      {children}
    </motion.div>
  );
}

export interface AnimatedListProps extends ComponentPropsWithoutRef<"div"> {
  children: React.ReactNode;
}

export const AnimatedList = React.memo(
  ({ children, className, ...props }: AnimatedListProps) => {
    const childrenArray = React.Children.toArray(children);

    return (
      <div
        className={cn("flex flex-col gap-2.5", className)}
        {...props}
      >
        <AnimatePresence initial={false}>
          {childrenArray.map((item, idx) => (
            <AnimatedListItem
              key={(item as React.ReactElement)?.key ?? `item-${idx}`}
            >
              {item}
            </AnimatedListItem>
          ))}
        </AnimatePresence>
      </div>
    );
  }
);

AnimatedList.displayName = "AnimatedList";

