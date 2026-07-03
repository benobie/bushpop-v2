"use client";

import { useEffect, useRef, useState } from "react";

export const READY_PULSE_DURATION_MS = 1500;
export const SELL_READY_PULSE_CLASS = "ready";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useReadyPulse(isReady: boolean): boolean {
  const [isPulsing, setIsPulsing] = useState(false);
  const previousReadyRef = useRef(isReady);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const wasReady = previousReadyRef.current;
    previousReadyRef.current = isReady;

    if (!isReady) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setIsPulsing(false);
      return;
    }

    if (wasReady || prefersReducedMotion()) {
      return;
    }

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    setIsPulsing(true);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setIsPulsing(false);
    }, READY_PULSE_DURATION_MS);
  }, [isReady]);

  return isPulsing;
}

export function shouldEnterAdvance(activeElement: Element | null, currentStep: string): boolean {
  if (currentStep === "review") {
    return false;
  }

  return activeElement?.tagName.toLowerCase() !== "textarea";
}
