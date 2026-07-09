import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";
import { browseListings } from "@/lib/data/listings";
import { Button, Rail, RailItem, Pcard, FoilBadge } from "@bushpop/ui";
import { formatMoney } from "@/lib/format-money";
import { categoryLabel } from "@/lib/category-labels";

export default async function HomePage() {
  const config = getChannelConfig(DEFAULT_CHANNEL);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      {/* Hero — static, prerendered at build (no API needed) */}
      <div className="mb-10 text-center">
        <h1 className="font-display text-4xl font-bold text-bp-ink">
          {config.name}
        </h1>
        <p className="mt-2 text-lg text-bp-ink-2">{config.shortTagline}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild variant="primary" size="lg">
            <Link href="/shop">Browse all</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/sell">Start selling</Link>
          </Button>
        </div>
      </div>

      {/*
        No "Popular this week" section (W5 default — no real search-query
        data source yet).

        W3 (duo tiles) descoped from a literal "Shop women / Shop men" split
        (design/HANDOFF-home.md) to "Shop by category" — there is no gender
        field anywhere in the schema (inventory_items has no such column,
        AI drafts don't infer it), and the design prototype's gender split
        was fixture-only (`g:'w'|'m'|'u'` on hardcoded cards). Adding a real
        gender attribute is a schema + AI-prompt + wizard change, out of
        scope here. Categories ARE real and seeded (packages/db/src/seeds/
        categories.ts), so the two tiles below link to the two categories
        with the most live listings — counts and images both computed at
        request time, never fabricated (trust-claims ledger §1).
      */}
      <Suspense fallback={null}>
        <CategoryDuo />
      </Suspense>

      {/* Recent listings preview — rendered at request time, not build time.
          The cached browseListings() fetcher hits the API, which is NOT
          available during the static web build (see apps/market/Dockerfile:
          "the build needs NO server secrets"). `connection()` defers this
          subtree to the first request; the result still caches per the
          'shop' cacheLife profile thereafter. */}
      <Suspense fallback={<LatestListingsSkeleton />}>
        <LatestListings />
      </Suspense>
    </main>
  );
}

async function LatestListings() {
  await connection();
  const result = await browseListings({ channel: DEFAULT_CHANNEL, limit: 8 });

  // Pcard has no built-in "no image" placeholder (unlike ListingCard) — an
  // empty src renders a broken-image icon, so listings without a primary
  // image are skipped here rather than shown broken.
  const items = result.items.filter((listing) => listing.primaryImageUrl);

  if (!items.length) return null;

  return (
    <>
      <h2 className="mb-4 font-display text-xl font-semibold text-bp-ink">
        Latest listings
      </h2>
      {/* Rail is FLEX, never grid — grid+overflow-x silently enables vertical
          scroll instead of horizontal (shipped 3x in the prototype). */}
      <Rail>
        {items.map((listing, index) => (
          <RailItem key={listing.id} className="w-[42%] flex-shrink-0 sm:w-[28%] md:w-[22%]">
            <Link href={`/listing/${listing.handle}`}>
              <Pcard
                imageSrc={listing.primaryImageUrl!}
                imageAlt={listing.title}
                title={listing.title}
                price={formatMoney(listing.priceCents, listing.currency)}
                brand={listing.brand ?? undefined}
                size={listing.size ?? undefined}
                badges={<FoilBadge variant="fresh">New</FoilBadge>}
                priority={index < 2}
              />
            </Link>
          </RailItem>
        ))}
      </Rail>
      <div className="mt-6 text-center">
        <Button asChild variant="outline">
          <Link href="/shop">View all listings</Link>
        </Button>
      </div>
    </>
  );
}

/**
 * "Shop by category" duo — the two categories with the most live listings,
 * each tile showing a real cover image + a live count. Renders nothing if
 * fewer than two categories have listings yet (an honest empty state per
 * the trust-claims ledger — no half-filled duo, no fabricated category).
 */
async function CategoryDuo() {
  await connection();
  const overview = await browseListings({ channel: DEFAULT_CHANNEL, limit: 1 });
  const counts = Object.entries(overview.facetDistribution?.categorySlug ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  const top2 = counts.slice(0, 2);
  if (top2.length < 2) return null;

  const tiles = await Promise.all(
    top2.map(async ([slug, count]) => {
      const preview = await browseListings({ channel: DEFAULT_CHANNEL, categorySlug: slug, limit: 1 });
      return {
        slug,
        count,
        name: categoryLabel(slug),
        imageUrl: preview.items[0]?.primaryImageUrl ?? null,
      };
    }),
  );

  return (
    <div className="mb-12">
      <h2 className="mb-4 font-display text-xl font-semibold text-bp-ink">Shop by category</h2>
      <div className="grid grid-cols-2 gap-4">
        {tiles.map((tile) => (
          <Link
            key={tile.slug}
            href={`/shop?categorySlug=${encodeURIComponent(tile.slug)}`}
            className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-bp-surface-2 sm:aspect-[16/9]"
          >
            {tile.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- plain <img>, matches Pcard's approach (no next/image domain config here)
              <img
                src={tile.imageUrl}
                alt={tile.name}
                loading="eager"
                fetchPriority="high"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 p-4 text-white">
              <p className="font-display text-lg font-semibold">{tile.name}</p>
              <p className="text-sm text-white/80">
                {tile.count} {tile.count === 1 ? "listing" : "listings"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function LatestListingsSkeleton() {
  return (
    <>
      <div className="mb-4 h-6 w-36 animate-pulse rounded bg-bp-surface-2" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-[42%] flex-shrink-0 space-y-2 sm:w-[28%] md:w-[22%]">
            <div className="aspect-[3/4] animate-pulse rounded-xl bg-bp-surface-2" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-bp-surface-2" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-bp-surface-2" />
          </div>
        ))}
      </div>
    </>
  );
}
