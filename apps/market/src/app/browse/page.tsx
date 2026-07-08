/**
 * Browse page — public listing grid with filter/sort/pagination.
 * Server component; forced dynamic because it reads searchParams.
 *
 * Uses the cached browseListings() data fetcher from lib/data/listings.ts.
 * Filters are pushed via the FilterBar client island and land in searchParams here.
 */

import { Suspense } from "react";
import Link from "next/link";
import { DEFAULT_CHANNEL } from "@bushpop/config";
import { browseListings } from "@/lib/data/listings";
import { getFavoritedIds } from "@/lib/data/wishlist";
import { ListingCard } from "@/components/listing/listing-card";
import { FilterBar } from "@/components/listing/filter-bar";
import { Button } from "@bushpop/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse",
  description: "Browse preloved fashion listings on Bushpop",
};

const PAGE_SIZE = 24;

interface BrowsePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function getNumber(v: string | string[] | undefined): number | undefined {
  const s = getString(v);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export default async function BrowsePage({
  searchParams,
}: BrowsePageProps) {
  const sp = await searchParams;

  const offset = getNumber(sp.offset) ?? 0;
  const sort = getString(sp.sort) as
    | "newest"
    | "price_asc"
    | "price_desc"
    | undefined;

  const result = await browseListings({
    channel: DEFAULT_CHANNEL,
    limit: PAGE_SIZE,
    offset,
    categorySlug: getString(sp.categorySlug),
    size: getString(sp.size),
    colour: getString(sp.colour),
    brand: getString(sp.brand),
    condition: getString(sp.condition),
    minPrice: getNumber(sp.minPrice),
    maxPrice: getNumber(sp.maxPrice),
    sort,
  });

  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const favoritedIds = await getFavoritedIds(result.items.map((listing) => listing.id));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-bp-ink">Browse</h1>
        <p className="text-sm text-bp-ink-2">
          {result.total} {result.total === 1 ? "listing" : "listings"}
        </p>
      </div>

      {/* Filter bar — client island */}
      <div className="mb-6">
        <Suspense fallback={null}>
          <FilterBar basePath="/browse" facetDistribution={result.facetDistribution} />
        </Suspense>
      </div>

      {/* Listing grid */}
      {result.items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <p className="text-lg text-bp-ink-2">No listings found</p>
          <p className="text-sm text-bp-ink-3">
            Try adjusting your filters or check back later.
          </p>
          {offset > 0 && (
            <Button asChild variant="outline">
              <Link href="/browse">Back to start</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {result.items.map((listing, index) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                priority={index < 4}
                initialFavorited={favoritedIds.has(listing.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-10 flex items-center justify-between">
            <div>
              {offset > 0 && (
                <Button asChild variant="outline">
                  <Link
                    href={`/browse?offset=${prevOffset}${buildQuerySuffix(sp, ["offset"])}`}
                  >
                    ← Previous
                  </Link>
                </Button>
              )}
            </div>
            <p className="text-sm text-bp-ink-2">
              {offset + 1}–{Math.min(offset + result.items.length, result.total)} of {result.total}
            </p>
            <div>
              {result.hasMore && (
                <Button asChild variant="outline">
                  <Link
                    href={`/browse?offset=${nextOffset}${buildQuerySuffix(sp, ["offset"])}`}
                  >
                    Next →
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

/** Re-append all existing search params except the excluded keys */
function buildQuerySuffix(
  sp: Record<string, string | string[] | undefined>,
  exclude: string[],
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(sp)) {
    if (exclude.includes(k)) continue;
    if (Array.isArray(v)) {
      for (const item of v) parts.push(`&${k}=${encodeURIComponent(item)}`);
    } else if (v !== undefined) {
      parts.push(`&${k}=${encodeURIComponent(v)}`);
    }
  }
  return parts.join("");
}
