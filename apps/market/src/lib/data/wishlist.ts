/**
 * Batched server-side favourited-status lookup for browse/search grids.
 *
 * Deliberately NOT part of `browseListings`/`searchListings` (lib/data/listings.ts)
 * — those are `'use cache'` fetchers tagged per-channel and shared across every
 * visitor, so baking one customer's wishlist state into them would leak it into
 * every other user's cached page. This is an uncached, per-request, per-customer
 * fetch called separately from the page component instead.
 */
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { getOptionalCustomer } from "@/lib/require-auth";

export async function getFavoritedIds(listingIds: string[]): Promise<Set<string>> {
  if (listingIds.length === 0) return new Set();

  const customer = await getOptionalCustomer();
  if (!customer) return new Set();

  const api = await createAuthedApiClient();
  const { data } = await api.POST("/api/v1/customer/wishlist/batch-check", {
    body: { listingIds },
  });

  return new Set(data?.favoritedIds ?? []);
}
