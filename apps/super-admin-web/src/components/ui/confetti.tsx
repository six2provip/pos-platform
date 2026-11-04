"use client";

import confetti from "canvas-confetti";

export function fireSuccessConfetti() {
  if (typeof window === "undefined") return;
  try {
    void confetti({
      particleCount: 55,
      spread: 65,
      origin: { y: 0.7 },
      zIndex: 9999,
    });
  } catch {
    // ignore in non-canvas environments
  }
}

