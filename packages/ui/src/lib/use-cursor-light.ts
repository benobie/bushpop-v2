"use client";

import * as React from "react";

/**
 * Pointer-lerp cursor light — sets two CSS custom properties on the ref'd
 * element that track the pointer position with inertia (lerp .16), for the
 * cursor-light border/interior-glow recipes in lit-glass.css (--bp-mx/--bp-my
 * on buttons/chips/drawer rows, --bp-cx/--bp-cy on product cards).
 *
 * No-ops under prefers-reduced-motion — the CSS recipes default those vars
 * to 50% (centred), a static fallback that still looks intentional.
 */
export function useCursorLight<T extends HTMLElement>(
  varX = "--bp-mx",
  varY = "--bp-my",
  lerp = 0.16,
): React.MutableRefObject<T | null> {
  const ref = React.useRef<T | null>(null) as React.MutableRefObject<T | null>;

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let target = { x: 0, y: 0 };
    let current: { x: number; y: number } | null = null;
    let raf: number | null = null;

    const tick = () => {
      if (!current) return;
      current.x += (target.x - current.x) * lerp;
      current.y += (target.y - current.y) * lerp;
      el.style.setProperty(varX, `${current.x.toFixed(1)}px`);
      el.style.setProperty(varY, `${current.y.toFixed(1)}px`);
      const live = Math.abs(target.x - current.x) > 0.4 || Math.abs(target.y - current.y) > 0.4;
      raf = live ? requestAnimationFrame(tick) : null;
    };

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      target = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (!current) current = { ...target };
      if (!raf) raf = requestAnimationFrame(tick);
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [varX, varY, lerp]);

  return ref;
}
