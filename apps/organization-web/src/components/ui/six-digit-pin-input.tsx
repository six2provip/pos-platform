"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

export interface SixDigitPinInputProps {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function SixDigitPinInput({
  value,
  onChange,
  autoFocus = true,
  disabled = false,
}: SixDigitPinInputProps) {
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || "");
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const newDigits = [...digits];
      if (newDigits[index]) {
        newDigits[index] = "";
        onChange(newDigits.join(""));
      } else if (index > 0) {
        newDigits[index - 1] = "";
        onChange(newDigits.join(""));
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const rawVal = e.target.value.replace(/\D/g, "");
    if (!rawVal) return;

    const char = rawVal.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    onChange(newDigits.join(""));

    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;

    onChange(pasted);
    const targetIdx = Math.min(pasted.length, 5);
    inputRefs.current[targetIdx]?.focus();
  };

  return (
    <div className="flex items-center justify-center gap-2.5 sm:gap-3 py-2">
      {digits.map((digit, idx) => {
        const isFocused = focusedIndex === idx;
        const isFilled = !!digit;

        return (
          <div
            key={idx}
            onClick={() => inputRefs.current[idx]?.focus()}
            className="relative flex cursor-pointer select-none items-center justify-center"
          >
            <input
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              disabled={disabled}
              value={digit}
              onFocus={() => setFocusedIndex(idx)}
              onBlur={() => setFocusedIndex(-1)}
              onChange={(e) => handleChange(idx, e)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              className="absolute inset-0 h-full w-full opacity-0 cursor-pointer z-10"
            />
            <motion.div
              animate={{
                scale: isFocused ? 1.05 : 1,
                borderColor: isFocused
                  ? "#E11D48" // vivid rose/magenta border matching video
                  : isFilled
                  ? "#18181B"
                  : "#E5E7EB",
                boxShadow: isFocused
                  ? "0 0 0 4px rgba(225, 29, 72, 0.12)"
                  : "none",
                backgroundColor: isFocused
                  ? "#FFFFFF"
                  : isFilled
                  ? "#FFFFFF"
                  : "#F3F4F6",
              }}
              transition={{ duration: 0.15 }}
              className="flex h-14 w-12 sm:h-16 sm:w-14 items-center justify-center rounded-2xl border-2 transition-colors pointer-events-none"
            >
              <AnimatePresence mode="popLayout">
                {digit ? (
                  <motion.span
                    key={`${idx}-${digit}`}
                    initial={{ scale: 0.3, opacity: 0, y: 4 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.3, opacity: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 25,
                    }}
                    className="font-mono text-2xl sm:text-3xl font-bold text-neutral-900"
                  >
                    {digit}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

