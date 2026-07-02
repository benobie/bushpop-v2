/**
 * Shared listing card for browse + search grids.
 * Server component — no interactivity, just presentation.
 *
 * Item shape matches both browseListings and searchListings response items
 * (identical shapes per schema.d.ts).
 */
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, Badge } from "@bushpop/ui";
import { formatMoney } from "@/lib/format-money";

interface ListingCardItem {
  id: string;
  title: string;
  handle: string;
  priceCents: number;
  currency: string;
  primaryImageUrl: string | null;
  brand: string | null;
  size: string | null;
  colour: string | null;
  condition: string | null;
  categorySlug: string | null;
  seller: {
    id: string;
    handle: string;
    storeName: string;
    avatarUrl: string | null;
  };
}

interface ListingCardProps {
  listing: ListingCardItem;
}

export function ListingCard({ listing }: ListingCardProps) {
  return (
    <Link href={`/listing/${listing.handle}`} className="group block">
      <Card className="overflow-hidden transition-shadow hover:shadow-md">
        {/* Image area */}
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-brand-100">
          {listing.primaryImageUrl ? (
            <Image
              src={listing.primaryImageUrl}
              alt={listing.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-4xl text-brand-300">◻</span>
            </div>
          )}
        </div>

        <CardContent className="p-3">
          {/* Price */}
          <p className="text-base font-bold text-brand-900">
            {formatMoney(listing.priceCents, listing.currency)}
          </p>

          {/* Title */}
          <p className="mt-0.5 truncate text-sm text-brand-700">{listing.title}</p>

          {/* Seller */}
          <p className="mt-0.5 truncate text-xs text-brand-400">
            {listing.seller.storeName || listing.seller.handle}
          </p>

          {/* Badges — brand / size / condition */}
          {(listing.brand || listing.size || listing.condition) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {listing.brand && (
                <Badge variant="default" className="text-xs">
                  {listing.brand}
                </Badge>
              )}
              {listing.size && (
                <Badge variant="outline" className="text-xs">
                  {listing.size}
                </Badge>
              )}
              {listing.condition && (
                <Badge variant="outline" className="text-xs">
                  {listing.condition}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
