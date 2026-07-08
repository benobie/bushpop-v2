"use client";

/**
 * "Save this search" control for the PLP filter bar. Captures the current
 * q + filter searchParams, POSTs to the customer saved-searches API.
 * Hidden entirely when there's no active criteria to save.
 *
 * BF-10 — saves immediately on a single click with no label; a label is
 * optional and added afterward from /account/searches (searches-list.tsx),
 * not gated here as a required second step.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { Button } from "@bushpop/ui";
import { track } from "@/lib/analytics";
import { DEFAULT_CHANNEL } from "@bushpop/config";

const FILTER_KEYS = ["categorySlug", "size", "colour", "brand", "condition", "minPrice", "maxPrice"];

interface SaveSearchButtonProps {
  q?: string;
}

export function SaveSearchButton({ q }: SaveSearchButtonProps) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "duplicate" | "limit" | "error">("idle");

  const filters: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = searchParams.get(key);
    if (value) filters[key] = value;
  }
  const hasCriteria = !!(q && q.trim()) || Object.keys(filters).length > 0;
  const queryValue = q && q.trim() ? q.trim() : "*";
  const criteriaSignature = `${queryValue}|${FILTER_KEYS.map((key) => `${key}:${searchParams.get(key) ?? ""}`).join("|")}`;
  const latestCriteriaRef = useRef(criteriaSignature);

  useEffect(() => {
    latestCriteriaRef.current = criteriaSignature;
    setStatus("idle");
  }, [criteriaSignature]);

  if (!hasCriteria) return null;

  async function handleSave() {
    const saveCriteria = criteriaSignature;
    setStatus("saving");
    try {
      const api = createBrowserApiClient();
      const { response } = await api.POST("/api/v1/customer/saved-searches", {
        body: { query: queryValue, filters },
      });

      if (response.status === 401) {
        const returnTo = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/sign-in?next=${encodeURIComponent(returnTo)}`;
        return;
      }
      if (latestCriteriaRef.current !== saveCriteria) {
        return;
      }
      if (response.status === 409) {
        setStatus("duplicate");
        return;
      }
      if (response.status === 422) {
        setStatus("limit");
        return;
      }
      if (!response.ok) {
        setStatus("error");
        return;
      }

      track({ event: "search.saved", props: { channel: DEFAULT_CHANNEL, query: queryValue } });
      setStatus("saved");
    } catch {
      if (latestCriteriaRef.current !== saveCriteria) {
        return;
      }
      setStatus("error");
    }
  }

  if (status === "saved") {
    return (
      <p className="text-xs text-brand-500">
        Search saved —{" "}
        <Link href="/account/searches" className="underline">
          add a label or view your saved searches
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSave}
        disabled={status === "saving"}
        className="text-brand-500"
      >
        {status === "saving" ? "Saving…" : "Save this search"}
      </Button>
      {status === "duplicate" && (
        <span className="text-xs text-red-600">You've already saved this exact search.</span>
      )}
      {status === "limit" && (
        <span className="text-xs text-red-600">You've reached the maximum of 20 saved searches.</span>
      )}
      {status === "error" && <span className="text-xs text-red-600">Couldn't save. Try again.</span>}
    </div>
  );
}
