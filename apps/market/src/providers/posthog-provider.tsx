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

/**
 * Query keys that carry a capability or credential and must never be sent to
 * analytics. `token` is the guest order-access token: a long-lived, PII-bearing
 * capability that appears in `/orders/[id]/guest?token=…`, i.e. in the very URL
 * a guest opens from their email. A denylist rather than an allowlist so any
 * future token-in-URL pattern is covered by adding one entry here.
 */
const SENSITIVE_QUERY_KEYS = ["token", "code", "secret", "signature", "sig"];

/**
 * Replace the value of any sensitive query parameter with a marker, preserving
 * the rest of the URL so pageview analytics stay useful. Accepts absolute URLs
 * and path-relative ones.
 */
export function redactUrl(url: string): string {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return url;

  const [path, queryAndHash] = [url.slice(0, queryStart), url.slice(queryStart + 1)];
  const hashStart = queryAndHash.indexOf("#");
  const query = hashStart === -1 ? queryAndHash : queryAndHash.slice(0, hashStart);
  const hash = hashStart === -1 ? "" : queryAndHash.slice(hashStart);

  const params = new URLSearchParams(query);
  let redacted = false;
  for (const key of SENSITIVE_QUERY_KEYS) {
    if (params.has(key)) {
      params.set(key, "redacted");
      redacted = true;
    }
  }
  if (!redacted) return url;

  const rebuilt = params.toString();
  return rebuilt ? `${path}?${rebuilt}${hash}` : `${path}${hash}`;
}

/**
 * Runs on EVERY captured event, including autocapture — which repeats
 * `$current_url` on click events, not just on the pageviews we emit by hand.
 */
function sanitizeProperties(properties: Record<string, unknown>) {
  for (const key of ["$current_url", "$referrer", "$pathname"]) {
    const value = properties[key];
    if (typeof value === "string") {
      properties[key] = redactUrl(value);
    }
  }
  return properties;
}

let posthogInitialised = false;

function initPostHog() {
  if (posthogInitialised || typeof window === "undefined") return;
  if (!POSTHOG_KEY) return; // silently no-op in dev without a key

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false, // handled manually by the observer below
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    sanitize_properties: sanitizeProperties,
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

    posthog.capture("$pageview", { $current_url: redactUrl(url) });
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
