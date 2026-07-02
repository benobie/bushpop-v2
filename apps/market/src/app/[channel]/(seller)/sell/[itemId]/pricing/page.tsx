"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { ShippingClassPicker } from "@/components/wizard/shipping-class-picker";
import { FLAT_RATE_SHIPPING_CENTS } from "@bushpop/config";

type ShippingClass = "xs" | "s" | "m" | "l" | "xl";

export default function PricingPage() {
  const { channel, itemId } = useParams<{ channel: string; itemId: string }>();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceDollars, setPriceDollars] = useState("");
  const [shippingClass, setShippingClass] = useState<ShippingClass | null>(null);
  const [itemVersion, setItemVersion] = useState(1);
  const [itemTitle, setItemTitle] = useState<string | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const api = createBrowserApiClient();

      // Load item for version and title
      const { data: item } = await api.GET("/api/v1/seller/inventory/{id}", {
        params: { path: { id: itemId } },
      });
      if (item) {
        setItemVersion(item.version);
        setItemTitle(item.title ?? null);
        if (item.shippingClass) {
          setShippingClass(item.shippingClass as ShippingClass);
        }
      }

      // Load channel ID from me endpoint (has channel.id in runtime response)
      const { data: me } = await api.GET("/api/v1/customer/me");
      if (me) {
        // channel.id is returned at runtime (Sprint 1a me endpoint extended)
        const channelData = me.channel as { id: string; slug: string; name: string };
        setChannelId(channelData.id);
      }
    }
    load();
  }, [itemId]);

  const priceCents = Math.round(parseFloat(priceDollars || "0") * 100);
  const shippingCents = shippingClass ? FLAT_RATE_SHIPPING_CENTS[shippingClass] : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (priceCents < 100) {
      setError("Price must be at least $1.00.");
      return;
    }
    if (!shippingClass) {
      setError("Please select a shipping class.");
      return;
    }
    if (!channelId) {
      setError("Channel not loaded. Please refresh.");
      return;
    }
    if (!itemTitle) {
      setError("Item title is missing. Go back to Details and add a title.");
      return;
    }

    setSaving(true);
    setError(null);

    const api = createBrowserApiClient();

    // 1. Update inventory item with shipping class
    const { error: patchItemError } = await api.PATCH("/api/v1/seller/inventory/{id}", {
      params: { path: { id: itemId } },
      body: { shippingClass, version: itemVersion },
    });

    if (patchItemError) {
      setError("Failed to save shipping class. Please try again.");
      setSaving(false);
      return;
    }

    // 2. Check if a listing already exists for this item
    const { data: listings } = await api.GET("/api/v1/seller/listings");
    const existingListing = listings?.items.find(
      (l) => l.inventoryItemId === itemId,
    );

    if (existingListing) {
      // Update existing listing
      const { error: patchErr } = await api.PATCH("/api/v1/seller/listings/{id}", {
        params: { path: { id: existingListing.id } },
        body: { priceCents, version: existingListing.version },
      });
      if (patchErr) {
        setError("Failed to update listing price. Please try again.");
        setSaving(false);
        return;
      }
    } else {
      // Create new listing
      const { error: createErr } = await api.POST("/api/v1/seller/listings", {
        body: {
          inventoryItemId: itemId,
          channelId,
          title: itemTitle,
          priceCents,
        },
      });
      if (createErr) {
        setError("Failed to create listing. Please try again.");
        setSaving(false);
        return;
      }
    }

    router.push(`/${channel}/sell/${itemId}/review`);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <StepIndicator currentStep="Pricing" />

      <div className="mt-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-brand-900">Set price &amp; shipping</h1>
          <p className="mt-1 text-sm text-brand-500">
            Choose a competitive price. Shipping is flat-rate by parcel size.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Price input */}
          <div>
            <label htmlFor="price" className="mb-1 block text-sm font-medium text-brand-800">
              Price (AUD) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-500">$</span>
              <input
                id="price"
                type="number"
                min="1"
                step="0.01"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                className="w-full rounded-lg border border-brand-200 py-2 pl-7 pr-4 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="25.00"
              />
            </div>
            {priceCents >= 100 && shippingCents && (
              <p className="mt-1 text-xs text-brand-500">
                Buyer pays ${((priceCents + shippingCents) / 100).toFixed(2)} total incl. shipping
              </p>
            )}
          </div>

          {/* Shipping class picker */}
          <ShippingClassPicker value={shippingClass} onChange={setShippingClass} />

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push(`/${channel}/sell/${itemId}/details`)}
              className="rounded-lg border border-brand-200 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-800 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Saving…" : "Next: Review"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
