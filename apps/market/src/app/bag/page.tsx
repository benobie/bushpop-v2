/**
 * Bag page — buyer's current cart.
 * Forced dynamic — never cache (createAuthedApiClient forces dynamic, and
 * cart state changes on every mutation).
 *
 * Guest commerce (BF-08): a guest with no session yet (never added anything)
 * has no cart to fetch, so we skip the API call entirely and render the
 * empty state — there's nothing to bootstrap just from viewing an empty bag.
 * A guest who already added something has a real (anonymous) session by
 * then, so the normal authed fetch below just works.
 *
 * Cart items now carry title/coverImage/handle (U1 §2.1 enrichment).
 */
import Link from "next/link";
import Image from "next/image";
import { getOptionalCustomer } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { RemoveFromBagButton } from "@/components/listing/remove-from-bag-button";
import { formatMoney } from "@/lib/format-money";
import { Button, Card, CardContent, CardFooter } from "@bushpop/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bag",
};

export default async function BagPage() {
  const customer = await getOptionalCustomer();

  let items: Array<{
    id: string;
    handle: string | null;
    title: string | null;
    coverImage: string | null;
    priceCents: number;
    currency: string;
  }> = [];

  if (customer) {
    const api = await createAuthedApiClient();
    const { data: cart, error } = await api.GET("/api/v1/store/cart");

    if (error) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-12">
          <p className="text-center text-bp-ink-2">
            Could not load your bag. Please try again.
          </p>
        </main>
      );
    }

    items = cart?.items ?? [];
  }
  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents, 0);
  const currency = items[0]?.currency ?? "AUD";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 font-display text-2xl font-bold text-bp-ink">
        Your Bag
      </h1>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="text-lg text-bp-ink-2">Your bag is empty</p>
          <p className="text-sm text-bp-ink-3">
            Browse listings and tap &ldquo;Add to bag&rdquo; to get started.
          </p>
          <Button asChild variant="primary">
            <Link href="/browse">Browse listings</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Item list */}
          <Card>
            <CardContent className="divide-y divide-bp-line p-0">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-4 py-4"
                >
                  <Link
                    href={item.handle ? `/listing/${item.handle}` : "#"}
                    className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-bp-surface-2"
                    aria-label={item.title ?? "View listing"}
                  >
                    {item.coverImage ? (
                      <Image
                        src={item.coverImage}
                        alt={item.title ?? "Listing photo"}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : null}
                  </Link>
                  <div className="flex-1 space-y-0.5">
                    <Link
                      href={item.handle ? `/listing/${item.handle}` : "#"}
                      className="text-sm font-medium text-bp-ink hover:underline"
                    >
                      {item.title ?? "Listing no longer available"}
                    </Link>
                    <p className="text-sm font-semibold text-bp-ink">
                      {formatMoney(item.priceCents, item.currency)}
                    </p>
                  </div>
                  <RemoveFromBagButton itemId={item.id} />
                </div>
              ))}
            </CardContent>
            <CardFooter className="flex justify-between border-t border-bp-line px-4 py-4">
              <p className="text-sm font-medium text-bp-ink-2">Subtotal</p>
              <p className="text-base font-bold text-bp-ink">
                {formatMoney(subtotalCents, currency)}
              </p>
            </CardFooter>
          </Card>

          {/* Buyer Protection + shipping note — computed at checkout, render-only */}
          <p className="px-1 text-xs text-bp-ink-3">
            Buyer Protection on every order. Shipping and any Buyer Protection fee are calculated at checkout.
          </p>

          {/* CTA */}
          <Button asChild variant="primary" size="lg" className="w-full">
            <Link href="/checkout">Proceed to checkout</Link>
          </Button>

          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/browse">Continue browsing</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
