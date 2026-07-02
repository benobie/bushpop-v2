/**
 * Public storefront data fetchers. (Sprint 0.5c — FM-R2-1 + GPT-Council R1)
 *
 * Each fetcher wraps its body in `'use cache'` + `cacheLife(profile)` and
 * registers explicit cache tags via BOTH:
 *   (a) `cacheTag()` from `next/cache`  — binds the function-cache entry
 *   (b) `createPublicApiClient({ tags })` — forwards to `fetch.next.tags`,
 *       binding the fetch-cache entry
 *
 * Belt-and-braces per R1 LB-1: the two mechanisms register in the same
 * global tag system but bind to different cache entries; tagging only one
 * leaves the other intact when `revalidateTag(tag, profile)` is called from
 * a Sprint 1a+ Server Action.
 *
 * Profile names match those defined in `apps/market/next.config.ts` → `cacheLife`:
 *   - browseListings   → 'browse'
 *   - getListing       → 'listing-detail'
 *   - searchListings   → 'search'
 *
 * The channel parameter is carried through the tag for multi-tenant
 * isolation per FM-9 — `channel:piklo:listings` and
 * `channel:bushpop:listings` invalidate independently even though the
 * underlying API currently returns channel-agnostic data.
 *
 * See AGENTS.md → "Cache Components model (Next.js 16.2.3+)".
 */

import { cacheLife, cacheTag } from "next/cache";
import {
  channelListingsTag,
  channelListingTag,
} from "@bushpop/api-client/cache-tags";
import { createPublicApiClient } from "@bushpop/api-client/server";

export interface BrowseFilters {
  channel: string;
  limit?: number;
  offset?: number;
  categorySlug?: string;
  size?: string;
  colour?: string;
  brand?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "newest" | "price_asc" | "price_desc";
}

export interface SearchFilters extends BrowseFilters {
  q: string;
}

/**
 * Browse the listings grid for a channel with optional filter/sort.
 * Cache profile: `'browse'` — 60s stale, 1h revalidate (FM-R2-1).
 * Invalidated by Sprint 1a Server Actions on listing publish/pause/archive.
 */
export async function browseListings(filters: BrowseFilters) {
  "use cache";
  cacheLife("browse");
  const tag = channelListingsTag(filters.channel);
  cacheTag(tag);

  const api = createPublicApiClient({ tags: [tag] });
  const { data, error } = await api.GET("/api/v1/store/listings", {
    params: {
      query: {
        limit: filters.limit,
        offset: filters.offset,
        categorySlug: filters.categorySlug,
        size: filters.size,
        colour: filters.colour,
        brand: filters.brand,
        condition: filters.condition,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        sort: filters.sort,
      },
    },
  });
  if (error) {
    throw new Error(`browseListings failed: ${JSON.stringify(error)}`);
  }
  return data;
}

/**
 * Fetch a single public listing by handle.
 * Cache profile: `'listing-detail'` — 5min stale, 1h revalidate (FM-R2-1).
 * Invalidated by Sprint 1a Server Actions on listing PATCH.
 */
export async function getListing(handle: string, channel: string) {
  "use cache";
  cacheLife("listing-detail");
  const tag = channelListingTag(channel, handle);
  cacheTag(tag);

  const api = createPublicApiClient({ tags: [tag] });
  const { data, error } = await api.GET("/api/v1/store/listings/{handle}", {
    params: { path: { handle } },
  });
  if (error) {
    throw new Error(`getListing failed: ${JSON.stringify(error)}`);
  }
  return data;
}

/**
 * Full-text search listings with filter/sort for a channel.
 * Cache profile: `'search'` — 0s stale, 60s revalidate (FM-R2-1).
 * Shorter lifetime: rapid filter churn, always-fresh expectations.
 * Invalidated by Sprint 1a Server Actions on listing publish/pause/archive.
 */
export async function searchListings(params: SearchFilters) {
  "use cache";
  cacheLife("search");
  const tag = channelListingsTag(params.channel);
  cacheTag(tag);

  const api = createPublicApiClient({ tags: [tag] });
  const { data, error } = await api.GET("/api/v1/store/search", {
    params: {
      query: {
        q: params.q,
        limit: params.limit,
        offset: params.offset,
        categorySlug: params.categorySlug,
        size: params.size,
        colour: params.colour,
        brand: params.brand,
        condition: params.condition,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        sort: params.sort,
      },
    },
  });
  if (error) {
    throw new Error(`searchListings failed: ${JSON.stringify(error)}`);
  }
  return data;
}
