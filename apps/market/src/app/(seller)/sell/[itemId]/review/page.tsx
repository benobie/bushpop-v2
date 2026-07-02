"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { ListingPreviewCard } from "@/components/wizard/listing-preview-card";
import { FLAT_RATE_SHIPPING_CENTS } from "@bushpop/config";

interface ReviewData {
  title: string | null;
  priceCents: number | null;
  shippingClass: string | null;
  imageUrl: string | null;
  brand: string | null;
  condition: string | null;
  listingId: string | null;
  listingVersion: number;
}

export default function ReviewPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const router = useRouter();
  const [data, setData] = useState<ReviewData>({
    title: null,
    priceCents: null,
    shippingClass: null,
    imageUrl: null,
    brand: null,
    condition: null,
    listingId: null,
    listingVersion: 1,
  });
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const api = createBrowserApiClient();

      const { data: item } = await api.GET("/api/v1/seller/inventory/{id}", {
        params: { path: { id: itemId } },
      });

      const { data: listings } = await api.GET("/api/v1/seller/listings");
      const listing = listings?.items.find((l) => l.inventoryItemId === itemId);

      const primaryImage = item?.images?.find((img) => img.isPrimary) ?? item?.images?.[0];

      setData({
        title: item?.title ?? listing?.title ?? null,
        priceCents: listing?.priceCents ?? null,
        shippingClass: item?.shippingClass ?? null,
        imageUrl: primaryImage?.url ?? null,
        brand: item?.brand ?? null,
        condition: item?.condition ?? null,
        listingId: listing?.id ?? null,
        listingVersion: listing?.version ?? 1,
      });
    }
    load();
  }, [itemId]);

  async function handlePublish() {
    if (!data.listingId) {
      setError("No listing found. Please complete the pricing step first.");
      return;
    }

    setPublishing(true);
    setError(null);

    const api = createBrowserApiClient();

    // Gate: check Stripe charges_enabled
    const { data: stripeStatus } = await api.GET("/api/v1/seller/stripe/status");

    if (!stripeStatus?.stripeChargesEnabled) {
      // 409 redirect — direct to Stripe onboarding (ships in Sprint 1b)
      setError(
        "You need to complete Stripe onboarding before publishing. Go to Dashboard → Stripe to set up payments.",
      );
      setPublishing(false);
      return;
    }

    const { error: publishError } = await api.PATCH("/api/v1/seller/listings/{id}/status", {
      params: { path: { id: data.listingId } },
      body: { to: "active", version: data.listingVersion },
    });

    if (publishError) {
      setError("Failed to publish listing. Please try again.");
      setPublishing(false);
      return;
    }

    // Redirect to the PDP after publish (need the listing handle — fetch it)
    const { data: listing } = await api.GET("/api/v1/seller/listings/{id}", {
      params: { path: { id: data.listingId } },
    });

    if (listing?.handle) {
      router.push(`/listing/${listing.handle}`);
    } else {
      router.push("/dashboard/listings");
    }
  }

  const shippingCents = data.shippingClass
    ? FLAT_RATE_SHIPPING_CENTS[data.shippingClass] ?? null
    : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <StepIndicator currentStep="Review" />

      <div className="mt-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-brand-900">Review &amp; publish</h1>
          <p className="mt-1 text-sm text-brand-500">
            Check everything looks right before going live.
          </p>
        </div>

        <div className="max-w-xs">
          <ListingPreviewCard
            title={data.title}
            priceCents={data.priceCents}
            imageUrl={data.imageUrl}
            handle={data.listingId}
            shippingCents={shippingCents}
            brand={data.brand}
            condition={data.condition}
          />
        </div>

        {/* Quick checklist */}
        <ul className="space-y-2 rounded-xl border border-brand-200 p-4">
          {[
            { label: "Title", ok: !!data.title },
            { label: "Price", ok: !!data.priceCents },
            { label: "Shipping class", ok: !!data.shippingClass },
          ].map(({ label, ok }) => (
            <li key={label} className="flex items-center gap-2 text-sm">
              <span
                className={[
                  "flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold",
                  ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600",
                ].join(" ")}
              >
                {ok ? "✓" : "!"}
              </span>
              <span className={ok ? "text-brand-700" : "font-medium text-red-600"}>
                {label} {ok ? "" : "— missing"}
              </span>
            </li>
          ))}
        </ul>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push(`/sell/${itemId}/pricing`)}
            className="rounded-lg border border-brand-200 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || !data.listingId}
            className="rounded-lg bg-brand-800 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {publishing ? "Publishing…" : "Publish listing"}
          </button>
        </div>
      </div>
    </main>
  );
}
