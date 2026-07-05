"use client";

import { useEffect } from "react";
import { track, type BushpopEvent } from "@/lib/analytics";

/**
 * Fire-once view event for a page rendered server-side (PDP, etc.) — PostHog
 * only runs client-side, so a Server Component can't call track() directly.
 * Renders nothing; mount it once per page.
 */
export function ViewTracker({ event }: { event: BushpopEvent }) {
  useEffect(() => {
    track(event);
    // Fire once on mount only — `event` is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
