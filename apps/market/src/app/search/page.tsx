/**
 * Search page — full-text search + filter/sort.
 * Server component; forced dynamic (reads searchParams).
 *
 * Guards empty `q` — the search API schema marks it required.
 * Renders a search input form above the grid so the user can refine.
 */

import { Suspense } from "react";
import Link from "next/link";
import { DEFAULT_CHANNEL } from "@bushpop/config";
import { searchListings } from "@/lib/data/listings";
import { getFavoritedIds } from "@/lib/data/wishlist";
import { ListingCard } from "@/components/listing/listing-card";
import { FilterBar } from "@/components/listing/filter-bar";
import { Button, Input } from "@bushpop/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search",
};

const PAGE_SIZE = 24;

interface SearchPageProps {
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

export default async function SearchPage({
  searchParams,
}: SearchPageProps) {
  const sp = await searchParams;

  const q = getString(sp.q) ?? "";
  const offset = getNumber(sp.offset) ?? 0;
  const sort = getString(sp.sort) as
    | "newest"
    | "price_asc"
    | "price_desc"
    | undefined;

  // Guard: search API requires a non-empty q
  const hasQuery = q.trim().length > 0;
  const result = hasQuery
    ? await searchListings({
        channel: DEFAULT_CHANNEL,
        q: q.trim(),
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
      })
    : null;

  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const favoritedIds = await getFavoritedIds((result?.items ?? []).map((listing) => listing.id));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Search input — always visible for refinement */}
      <form action="/search" method="get" className="mb-6">
        <div className="flex gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search for clothing, brands, styles…"
            className="flex-1"
            autoComplete="off"
            autoFocus={!hasQuery}
          />
          <Button type="submit" variant="primary">
            Search
          </Button>
        </div>
      </form>

      {!hasQuery && (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <p className="text-lg text-brand-500">What are you looking for?</p>
          <p className="text-sm text-brand-400">
            Enter a search term above, or{" "}
            <Link href="/browse" className="underline hover:text-brand-700">
              browse all listings
            </Link>
            .
          </p>
        </div>
      )}

      {hasQuery && result && (
        <>
          <div className="mb-6 flex items-center justify-between">
            <h1 className="font-display text-xl font-semibold text-brand-900">
              &ldquo;{q}&rdquo;
            </h1>
            <p className="text-sm text-brand-500">
              {result.total} {result.total === 1 ? "result" : "results"}
            </p>
          </div>

          {/* Filter bar — client island */}
          <div className="mb-6">
            <Suspense fallback={null}>
              <FilterBar basePath="/search" q={q} facetDistribution={result.facetDistribution} />
            </Suspense>
          </div>

          {result.items.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-24 text-center">
              <p className="text-lg text-brand-500">No results for &ldquo;{q}&rdquo;</p>
              <p className="text-sm text-brand-400">
                Try different keywords or adjust your filters.
              </p>
              <Button asChild variant="outline">
                <Link href="/browse">Browse all</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {result.items.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
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
                        href={`/search?q=${encodeURIComponent(q)}&offset=${prevOffset}${buildQuerySuffix(sp, ["offset", "q"])}`}
                      >
                        ← Previous
                      </Link>
                    </Button>
                  )}
                </div>
                <p className="text-sm text-brand-500">
                  {offset + 1}–{Math.min(offset + result.items.length, result.total)} of{" "}
                  {result.total}
                </p>
                <div>
                  {result.hasMore && (
                    <Button asChild variant="outline">
                      <Link
                        href={`/search?q=${encodeURIComponent(q)}&offset=${nextOffset}${buildQuerySuffix(sp, ["offset", "q"])}`}
                      >
                        Next →
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
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
