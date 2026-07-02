import Image from "next/image";

interface ListingPreviewCardProps {
  title: string | null;
  priceCents: number | null;
  imageUrl: string | null;
  handle: string | null;
  shippingCents?: number | null;
  brand?: string | null;
  condition?: string | null;
}

function centsToDollars(cents: number | null): string {
  if (cents === null) return "–";
  return `$${(cents / 100).toFixed(2)}`;
}

export function ListingPreviewCard({
  title,
  priceCents,
  imageUrl,
  shippingCents,
  brand,
  condition,
}: ListingPreviewCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm">
      {/* Image */}
      <div className="relative aspect-square w-full bg-brand-100">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title ?? "Listing preview"}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 320px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-brand-300">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 space-y-1">
        <p className="truncate text-sm font-semibold text-brand-900">{title ?? "Untitled listing"}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {brand && <span className="rounded bg-brand-100 px-2 py-0.5 text-xs text-brand-600">{brand}</span>}
          {condition && <span className="rounded bg-brand-100 px-2 py-0.5 text-xs text-brand-600">{condition.replace(/_/g, " ")}</span>}
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-base font-bold text-brand-900">{centsToDollars(priceCents)}</span>
          {shippingCents !== null && shippingCents !== undefined && (
            <span className="text-xs text-brand-500">+{centsToDollars(shippingCents)} shipping</span>
          )}
        </div>
      </div>
    </div>
  );
}
