/**
 * Channel-namespaced cache tag helpers. (FM-9 + GPT-Council R1 FM-2)
 *
 * All cache tags MUST go through these helpers — bare `revalidateTag('listings')`
 * would purge both channels, causing cross-channel cache contamination.
 *
 * Named `channelTag` (not `cacheTag`) to avoid shadowing `next/cache`'s own
 * `cacheTag(...)` export, which Sprint 1a data fetchers import into the same
 * scope for registering tags against `'use cache'` function-cache entries.
 *
 * Usage:
 *   import { cacheTag } from 'next/cache'                        // binds function-cache entry
 *   import { channelListingsTag, channelListingTag } from '@bushpop/api-client/cache-tags'
 *
 *   async function getListing(handle: string, channel: string) {
 *     'use cache'
 *     cacheLife('listing-detail')
 *     const tag = channelListingTag(channel, handle)
 *     cacheTag(tag)                                              // tag the cached closure
 *     const api = createPublicApiClient({ tags: [tag] })         // belt-and-braces: tag the fetch too
 *     // ...
 *   }
 *
 * Taxonomy:
 *   channel:bushpop:listings          — all Bushpop listings
 *   channel:bushpop:listing:abc123    — single listing
 *   channel:bushpop:seller:def456     — single seller
 *   channel:bushpop:listings        — all Bushpop listings (isolated from other channels — Piklo)
 *   channel:bushpop:categories        — categories for the channel
 *   channel:bushpop:cart              — cart for the channel
 */
export function channelTag(
  channel: string,
  resource: string,
  id?: string,
): string {
  return id
    ? `channel:${channel}:${resource}:${id}`
    : `channel:${channel}:${resource}`;
}

/**
 * Tag for the listings collection of a given channel. Used by
 * `browseListings` and `searchListings` data fetchers; invalidated by
 * Server Actions that publish, pause, or archive a listing.
 */
export function channelListingsTag(channel: string): string {
  return channelTag(channel, "listings");
}

/**
 * Tag for a single listing (by handle or id) in a given channel. Used by
 * `getListing` data fetcher; invalidated by Server Actions that PATCH the
 * listing (title, description, price, status, etc.).
 */
export function channelListingTag(channel: string, idOrHandle: string): string {
  return channelTag(channel, "listing", idOrHandle);
}
