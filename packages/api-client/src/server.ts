/**
 * Server-side API client factories for Next.js RSC.
 * (FM-7, FM-11, FM-12 + FM-R2-1 + GPT-Council R1)
 *
 * Split into two variants:
 * - createPublicApiClient: no cookies, plain fetch helper. Data fetchers
 *   that wrap themselves in `'use cache'` + `cacheLife(profile)` call this
 *   inside the cached body and register tags via `cacheTag()` from
 *   `next/cache`. See `apps/market/src/lib/data/listings.ts` for the pattern.
 * - createAuthedApiClient: reads cookies via static `next/headers` import,
 *   forces dynamic rendering. Cannot be called from inside a `'use cache'`
 *   scope (cookies are a dynamic API).
 *
 * See AGENTS.md → "Cache Components model (Next.js 16.2.3+)".
 */

import { cookies } from "next/headers";
import createClient from "openapi-fetch";
import type { paths } from "./schema";

interface ApiClientOptions {
  tags?: string[];
  revalidate?: number | false;
}

const API_BASE_URL = process.env.API_BASE_URL ?? process.env.API_URL ?? "http://localhost:3333";

/**
 * Public storefront API client. Plain fetch helper — NOT wrapped in
 * `'use cache'` itself (cached function return values must be serializable
 * and `openapi-fetch`'s Client exposes method properties; see R1 SA-1).
 *
 * Per FM-R2-1: `'use cache'` placement belongs on data-fetching functions
 * (`getListing`, `browseListings`, `searchListings`), NOT inside this
 * factory — wrapping generically here caches across all endpoints and
 * breaks per-endpoint cache-tag targeting.
 *
 * Tags passed via `options.tags` forward to `fetch(input, { next: { tags } })`,
 * binding the fetch-cache entry. Callers inside a `'use cache'` scope
 * should ALSO call `cacheTag(...)` from `next/cache` inside their body to
 * bind the function-cache entry (belt-and-braces per R1 LB-1).
 */
export function createPublicApiClient(options?: ApiClientOptions) {
  return createClient<paths>({
    baseUrl: API_BASE_URL,
    headers: {
      "x-requested-with": "XMLHttpRequest",
    },
    fetch: (input: Request) => {
      const nextInit: Record<string, unknown> = {};
      if (options?.tags) nextInit.tags = options.tags;
      if (options?.revalidate !== undefined)
        nextInit.revalidate = options.revalidate;
      return fetch(input, { next: nextInit } as RequestInit);
    },
  });
}

/**
 * Authenticated storefront API client. Reads session cookies via static
 * `import { cookies } from 'next/headers'` (R1 FM-4: the previous
 * `@vite-ignore` dynamic-import hack hid the dynamic-API boundary from
 * Turbopack's static analysis under Cache Components).
 *
 * Forces dynamic rendering. MUST NOT be called from inside a `'use cache'`
 * scope — cookies are a dynamic API. To invalidate authed-visible data,
 * tag the underlying PUBLIC fetch that feeds it and invalidate via
 * `revalidateTag(tag, 'profile')` from a Server Action.
 *
 * No `options` parameter: authed fetches cannot be tag-cached, so
 * tag-forwarding would be dead code. (FM-R2-1 §0.5c DoD item 5.)
 */
export async function createAuthedApiClient() {
  const cookieStore = await cookies();

  return createClient<paths>({
    baseUrl: API_BASE_URL,
    headers: {
      cookie: cookieStore.toString(),
      "x-requested-with": "XMLHttpRequest",
    },
  });
}
