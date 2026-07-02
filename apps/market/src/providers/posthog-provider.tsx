"use client";

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";

/**
 * PostHog initialisation + navigation observer. (FM-3, FM-8)
 *
 * - Auto pageviews disabled (`capture_pageview: false`) — they double-count
 *   SPA navigations in Next.js App Router.
 * - Single observer depending on BOTH usePathname() AND useSearchParams() —
 *   pathname alone misses search-param changes and intercepting routes.
 */

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let posthogInitialised = false;

function initPostHog() {
  if (posthogInitialised || typeof window === "undefined") return;
  if (!POSTHOG_KEY) return; // silently no-op in dev without a key

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false, // handled manually by the observer below
    capture_pageleave: true,
    persistence: "localStorage+cookie",
  });
  posthogInitialised = true;
}

function PageviewObserverInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!POSTHOG_KEY) return;
    if (!pathname) return;

    const url = searchParams?.size
      ? `${pathname}?${searchParams.toString()}`
      : pathname;

    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Wraps the app and emits $pageview on every RSC navigation.
 * Must be rendered inside a Suspense boundary because useSearchParams()
 * requires it during prerender.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PageviewObserverInner />
      </Suspense>
      {children}
    </>
  );
}
