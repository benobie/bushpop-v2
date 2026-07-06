/**
 * Async server component — reads the session cookie + cart, so it's a
 * dynamic-data boundary under `cacheComponents`. Layout.tsx wraps it in a
 * <Suspense> (see SiteHeaderSkeleton) so the rest of the page tree stays
 * static/prerenderable (the loading.tsx / Suspense gotcha in this repo's
 * CLAUDE.md — "Uncached data accessed outside <Suspense>" build failure).
 */
import { getOptionalCustomer } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { SiteNavClient } from "./site-nav-client";
import { Wordmark } from "./wordmark";

export async function SiteHeader() {
  const customer = await getOptionalCustomer();

  let bagTotalCents = 0;
  let bagCount = 0;

  if (customer) {
    const api = await createAuthedApiClient();
    const { data: cart } = await api.GET("/api/v1/store/cart");
    if (cart) {
      bagCount = cart.items.length;
      bagTotalCents = cart.items.reduce((sum, item) => sum + item.priceCents, 0);
    }
  }

  return (
    <SiteNavClient
      logo={<Wordmark className="h-6 text-bp-obsidian" />}
      auth={!!customer}
      bagTotal={bagTotalCents}
      bagCount={bagCount}
      savedHref="/account/favourites"
    />
  );
}
