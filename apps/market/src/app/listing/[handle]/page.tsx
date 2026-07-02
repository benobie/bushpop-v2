import { notFound } from "next/navigation";
import { DEFAULT_CHANNEL } from "@bushpop/config";
import { getListing } from "@/lib/data/listings";
import { ImageGallery } from "@/components/listing/image-gallery";
import { AddToBagButton } from "@/components/listing/add-to-bag-button";
import { formatMoney } from "@/lib/format-money";
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
    aspectRatio: (img as { aspectRatio?: number | null }).aspectRatio ?? null,
  }));

  // Derive shipping cost from shippingClass if available
  // (not in store listing response directly — estimated from catalogue position)
  const shippingCents: number | null = null; // Will be shown as "Calculated at checkout"

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        {/* Image gallery */}
        <div>
          <ImageGallery
            images={galleryImages}
            title={listing.title}
          />
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
          </div>

          {/* Price block — CSS aspect-ratio pattern for price container (FM-R3-4) */}
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-brand-900">
              {formatMoney(listing.priceCents)}
            </span>
          </div>

          {/* Shipping info */}
          <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
            <p className="text-sm font-medium text-brand-800">
              {shippingCents !== null
                ? `Shipping: ${formatMoney(shippingCents)}`
                : "Shipping calculated at checkout"}
            </p>
          </div>

          {/* Add to bag */}
          <AddToBagButton
            listingId={listing.id}
            channel={DEFAULT_CHANNEL}
            disabled={listing.status !== "active"}
          />

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
