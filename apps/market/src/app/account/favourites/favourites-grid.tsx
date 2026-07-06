"use client";

/**
 * Client grid for /account/favourites — owns local list state so unfavouriting
 * a card removes it immediately without a full page refetch. Reuses Pcard
 * (already has a built-in favourite heart + burst animation) rather than the
 * browse/search ListingCard, which needs a seller handle this API doesn't
 * return.
 */
import { useState } from "react";
import Link from "next/link";
import { Pcard } from "@bushpop/ui";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { formatMoney } from "@/lib/format-money";

export interface FavouriteItem {
  id: string;
  listingId: string;
  listingHandle: string;
  title: string;
  priceCents: number;
  currency: string;
  primaryImageUrl: string | null;
  sellerName: string;
}

export function FavouritesGrid({ items }: { items: FavouriteItem[] }) {
  const [list, setList] = useState(items);

  async function handleUnfavorite(listingId: string) {
    // Optimistic removal — revert by re-inserting if the API call fails.
    const removed = list.find((i) => i.listingId === listingId);
    setList((current) => current.filter((i) => i.listingId !== listingId));

    const api = createBrowserApiClient();
    const { response } = await api.DELETE("/api/v1/customer/wishlist/{listingId}", {
      params: { path: { listingId } },
    });

    if (!response.ok && removed) {
      setList((current) => [...current, removed]);
    }
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-lg text-brand-500">No favourites yet</p>
        <p className="text-sm text-brand-400">Tap the heart on any listing to save it here.</p>
        <Link
          href="/browse"
          className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white"
        >
          Browse listings
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {/* Pcard has no built-in "no image" placeholder — skip rather than
          show a broken image (same rule as the home page rail). */}
      {list.filter((item) => item.primaryImageUrl).map((item) => (
        <Link key={item.id} href={`/listing/${item.listingHandle}`} className="block">
          <Pcard
            imageSrc={item.primaryImageUrl!}
            imageAlt={item.title}
            title={item.title}
            price={formatMoney(item.priceCents, item.currency)}
            favorited
            favoriteLabel="Remove from favourites"
            onFavoriteToggle={(next) => {
              if (!next) handleUnfavorite(item.listingId);
            }}
          />
        </Link>
      ))}
    </div>
  );
}
