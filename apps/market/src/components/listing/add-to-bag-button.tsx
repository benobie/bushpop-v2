"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { authClient } from "@/lib/auth-client";
import { track } from "@/lib/analytics";
import { DEFAULT_CHANNEL } from "@bushpop/config";

interface AddToBagButtonProps {
  listingId: string;
  /** @deprecated channel is resolved server-side; prop ignored but kept for call-site compat */
  channel?: string;
  disabled?: boolean;
  priceCents?: number;
}

export function AddToBagButton({ listingId, disabled, priceCents }: AddToBagButtonProps) {
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddToBag() {
    setLoading(true);
    setError(null);

    const api = createBrowserApiClient();
    let { response, error: addError } = await api.POST("/api/v1/store/cart/items", {
      body: { listingId },
    });

    // Guest commerce (BF-08) — a visitor with no session at all gets a 401
    // here. Bootstrap a real (anonymous) session and retry once, so "Add to
    // bag" never has to send a first-time guest to /sign-in.
    if (response.status === 401) {
      const { error: anonError } = await authClient.signIn.anonymous();
      if (anonError) {
        setError("Failed to add to bag. Please try again.");
        setLoading(false);
        return;
      }
      ({ response, error: addError } = await api.POST("/api/v1/store/cart/items", {
        body: { listingId },
      }));
    }

    if (addError) {
      setError("Failed to add to bag. Please try again.");
      setLoading(false);
      return;
    }

    track({
      event: "cart.add",
      props: { channel: DEFAULT_CHANNEL, listing_id: listingId, price_cents: priceCents ?? 0 },
    });
    setAdded(true);
    setLoading(false);
  }

  if (added) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3">
          <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <p className="text-sm font-medium text-green-700">Added to bag!</p>
        </div>
        <Link
          href="/bag"
          className="block w-full rounded-lg border border-brand-200 py-2 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          View bag →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={handleAddToBag}
        className="w-full rounded-lg bg-brand-800 py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        {loading ? "Adding…" : "Add to bag"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
