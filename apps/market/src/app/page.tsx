import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";
import { browseListings } from "@/lib/data/listings";
import { Button, Rail, RailItem, Pcard, FoilBadge } from "@bushpop/ui";
import { formatMoney } from "@/lib/format-money";

export default async function HomePage() {
  const config = getChannelConfig(DEFAULT_CHANNEL);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      {/* Hero — static, prerendered at build (no API needed) */}
      <div className="mb-10 text-center">
        <h1 className="font-display text-4xl font-bold text-brand-800">
          {config.name}
        </h1>
        <p className="mt-2 text-lg text-brand-500">{config.shortTagline}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild variant="primary" size="lg">
            <Link href="/browse">Browse all</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/sell">Start selling</Link>
          </Button>
        </div>
      </div>

      {/*
        No "Popular this week" section (W5 default — no real search-query
        data source yet) and no gender/category duo tiles (W3 default is
        "keep", but no category has been seeded in this environment yet —
        a duo tile linking to an empty category is exactly the kind of
        fixture the trust-claims ledger bans; wire this up once categories
        are seeded rather than fabricate the slugs here).
      */}

      {/* Recent listings preview — rendered at request time, not build time.
          The cached browseListings() fetcher hits the API, which is NOT
          available during the static web build (see apps/market/Dockerfile:
          "the build needs NO server secrets"). `connection()` defers this
          subtree to the first request; the result still caches per the
          'browse' cacheLife profile thereafter. */}
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
      <h2 className="mb-4 font-display text-xl font-semibold text-brand-800">
        Latest listings
      </h2>
      {/* Rail is FLEX, never grid — grid+overflow-x silently enables vertical
          scroll instead of horizontal (shipped 3x in the prototype). */}
      <Rail>
        {items.map((listing) => (
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
              />
            </Link>
          </RailItem>
        ))}
      </Rail>
      <div className="mt-6 text-center">
        <Button asChild variant="outline">
          <Link href="/browse">View all listings</Link>
        </Button>
      </div>
    </>
  );
}

function LatestListingsSkeleton() {
  return (
    <>
      <div className="mb-4 h-6 w-36 animate-pulse rounded bg-brand-100" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-[42%] flex-shrink-0 space-y-2 sm:w-[28%] md:w-[22%]">
            <div className="aspect-[3/4] animate-pulse rounded-xl bg-brand-100" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-brand-100" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-brand-100" />
          </div>
        ))}
      </div>
    </>
  );
}
