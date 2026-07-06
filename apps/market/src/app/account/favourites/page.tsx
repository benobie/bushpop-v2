/**
 * Favourites — buyer's wishlisted listings.
 * Authed + forced dynamic.
 */
import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { FavouritesGrid, type FavouriteItem } from "./favourites-grid";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Favourites",
};

// The wishlist API cursor-paginates with no cap on total items — follow
// nextCursor rather than a single fixed-size page, or anyone with more
// favourites than one page silently loses access to the older ones.
// Capped at 20 pages (2000 items at the API's max page size) as a sanity
// backstop, not a real-world limit.
const MAX_PAGES = 20;

async function fetchAllFavourites(
  api: Awaited<ReturnType<typeof createAuthedApiClient>>,
): Promise<{ items: FavouriteItem[]; error: boolean }> {
  const items: FavouriteItem[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await api.GET("/api/v1/customer/wishlist", {
      params: { query: { limit: 100, ...(cursor ? { cursor } : {}) } },
    });
    if (error) return { items, error: true };

    items.push(...(data?.items ?? []));
    if (!data?.nextCursor) break;
    cursor = data.nextCursor;
  }

  return { items, error: false };
}

export default async function FavouritesPage() {
  await requireAuth();

  const api = await createAuthedApiClient();
  const { items, error } = await fetchAllFavourites(api);

  if (error && items.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-center text-brand-500">Could not load your favourites. Please try again.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 font-display text-2xl font-bold text-brand-900">Favourites</h1>
      <FavouritesGrid items={items} />
    </main>
  );
}
