import { notFound } from "next/navigation";
import { DEFAULT_CHANNEL } from "@bushpop/config";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { getListing } from "@/lib/data/listings";
import { getOptionalCustomer } from "@/lib/require-auth";
import { ImageGallery } from "@/components/listing/image-gallery";
import { AddToBagButton } from "@/components/listing/add-to-bag-button";
import { FavButton } from "@/components/listing/fav-button";
import { ViewTracker } from "@/components/analytics/view-tracker";
import { formatMoney } from "@/lib/format-money";
import { conditionLabel } from "@/lib/condition-labels";
import { MEASUREMENT_KEY_LABELS } from "@bushpop/config";
import type { Metadata } from "next";

interface PDPProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: PDPProps): Promise<Metadata> {
  const { handle } = await params;
  try {
    const listing = await getListing(handle, DEFAULT_CHANNEL);
    return {
      title: listing.title,
      description: listing.description ?? undefined,
    };
  } catch {
    return { title: "Listing not found" };
  }
}

function measurementLabel(key: string): string {
  return (MEASUREMENT_KEY_LABELS as Record<string, string>)[key] ?? key;
}

export default async function PDPPage({ params }: PDPProps) {
  const { handle } = await params;

  let listing: Awaited<ReturnType<typeof getListing>>;
  try {
    listing = await getListing(handle, DEFAULT_CHANNEL);
  } catch {
    notFound();
  }

  if (listing.status !== "active") {
    notFound();
  }

  const galleryImages = listing.images.map((img) => ({
    id: img.id,
    url: img.url,
    position: img.position,
    isPrimary: img.isPrimary,
    aspectRatio: img.aspectRatio ?? null,
  }));

  const facts = [listing.brand, listing.size, conditionLabel(listing.condition), listing.colour].filter(
    (v): v is string => !!v,
  );

  const measurementEntries = listing.measurements ? Object.entries(listing.measurements) : [];

  const customer = await getOptionalCustomer();
  let initialFavorited = false;
  if (customer) {
    const api = await createAuthedApiClient();
    const { data } = await api.GET("/api/v1/customer/wishlist/{listingId}", {
      params: { path: { listingId: listing.id } },
    });
    initialFavorited = data?.favorited ?? false;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <ViewTracker
        event={{
          event: "pdp.view",
          props: { channel: DEFAULT_CHANNEL, listing_id: listing.id, category: listing.categorySlug },
        }}
      />
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        {/* Image gallery */}
        <div>
          <ImageGallery images={galleryImages} title={listing.title} />
        </div>

        {/* Listing info */}
        <div className="space-y-6">
          <div className="space-y-2">
            {listing.seller && (
              <p className="text-sm text-brand-500">
                by{" "}
                <span className="font-medium text-brand-700">
                  {listing.seller.storeName || listing.seller.handle}
                </span>
              </p>
            )}
            <h1 className="text-2xl font-bold text-brand-900">{listing.title}</h1>
            {facts.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {facts.map((fact) => (
                  <span
                    key={fact}
                    className="rounded-full border border-brand-200 px-3 py-1 text-xs font-medium text-bp-ink-2"
                  >
                    {fact}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Price block — CSS aspect-ratio pattern for price container (FM-R3-4) */}
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-brand-900">
              {formatMoney(listing.priceCents, listing.currency)}
            </span>
          </div>

          {/* Buyer Protection reassurance — approved whitelist phrase (trust-claims-ledger.md §W3);
              no fee amount rendered here (BP fee depends on shipping choice, computed at checkout). */}
          <div className="rounded-xl border border-brand-200 bg-bp-obsidian/[0.03] px-4 py-3">
            <p className="text-sm font-medium text-brand-800">Buyer Protection on every order</p>
            <p className="mt-0.5 text-xs text-brand-500">
              Shipping and any Buyer Protection fee are calculated at checkout.
            </p>
          </div>

          {/* Add to bag + favourite */}
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <AddToBagButton
                listingId={listing.id}
                channel={DEFAULT_CHANNEL}
                disabled={listing.status !== "active"}
                priceCents={listing.priceCents}
              />
            </div>
            <FavButton listingId={listing.id} variant="inline" initialFavorited={initialFavorited} />
          </div>

          {/* Measurements */}
          {measurementEntries.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-brand-800">Measurements</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {measurementEntries.map(([key, value]) => (
                  <div key={key} className="flex justify-between border-b border-brand-200 py-1">
                    <dt className="text-brand-500">{measurementLabel(key)}</dt>
                    <dd className="font-medium text-brand-800">{value} cm</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Description */}
          {listing.description && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-brand-800">Description</h2>
              <p className="whitespace-pre-wrap text-sm text-brand-600">{listing.description}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
