import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";
import { browseListings } from "@/lib/data/listings";
import { ListingCard } from "@/components/listing/listing-card";
import { Button } from "@bushpop/ui";

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

  if (!result.items.length) return null;

  return (
    <>
      <h2 className="mb-4 font-display text-xl font-semibold text-brand-800">
        Latest listings
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {result.items.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-[3/4] animate-pulse rounded-xl bg-brand-100" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-brand-100" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-brand-100" />
          </div>
        ))}
      </div>
    </>
  );
}
