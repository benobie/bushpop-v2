"use client";

/**
 * "Save this search" control for the PLP filter bar. Captures the current
 * q + filter searchParams, POSTs to the customer saved-searches API.
 * Hidden entirely when there's no active criteria to save.
 */
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { Input, Button } from "@bushpop/ui";
import { track } from "@/lib/analytics";
import { DEFAULT_CHANNEL } from "@bushpop/config";

const FILTER_KEYS = ["categorySlug", "size", "colour", "brand", "condition", "minPrice", "maxPrice"];

interface SaveSearchButtonProps {
  q?: string;
}

export function SaveSearchButton({ q }: SaveSearchButtonProps) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "duplicate" | "limit" | "error">("idle");

  const filters: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = searchParams.get(key);
    if (value) filters[key] = value;
  }
  const hasCriteria = !!(q && q.trim()) || Object.keys(filters).length > 0;
  const queryValue = q && q.trim() ? q.trim() : "*";

  if (!hasCriteria) return null;

  async function handleSave() {
    setStatus("saving");
    try {
      const api = createBrowserApiClient();
      const { response } = await api.POST("/api/v1/customer/saved-searches", {
        body: { query: queryValue, filters, name: name.trim() || undefined },
      });

      if (response.status === 401) {
        const returnTo = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/sign-in?next=${encodeURIComponent(returnTo)}`;
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
      setStatus("error");
    }
  }

  if (status === "saved") {
    return (
      <p className="text-xs text-brand-500">
        Search saved —{" "}
        <Link href="/account/searches" className="underline">
          view your saved searches
        </Link>
        .
      </p>
    );
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-brand-500">
        Save this search
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-9 w-40 text-sm"
        maxLength={100}
      />
      <Button size="sm" onClick={handleSave} disabled={status === "saving"}>
        {status === "saving" ? "Saving…" : "Save"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
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
