/**
 * Bag page — buyer's current cart.
 * Authed + forced dynamic — never cache (createAuthedApiClient forces dynamic,
 * and cart state changes on every mutation).
 *
 * Cart items from the API carry no title/image — renders minimal (price + index label + remove).
 */
import Link from "next/link";
import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { RemoveFromBagButton } from "@/components/listing/remove-from-bag-button";
import { formatMoney } from "@/lib/format-money";
import { Button, Card, CardContent, CardFooter } from "@bushpop/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bag",
};

export default async function BagPage() {
  await requireAuth();

  const api = await createAuthedApiClient();
  const { data: cart, error } = await api.GET("/api/v1/store/cart");

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-center text-brand-500">
          Could not load your bag. Please try again.
        </p>
      </main>
    );
  }

  const items = cart?.items ?? [];
  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents, 0);
  const currency = items[0]?.currency ?? "AUD";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 font-display text-2xl font-bold text-brand-900">
        Your Bag
      </h1>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="text-lg text-brand-500">Your bag is empty</p>
          <p className="text-sm text-brand-400">
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
            <CardContent className="divide-y divide-brand-100 p-0">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-4 py-4"
                >
                  <div className="space-y-0.5">
                    {/* Cart items carry no title from the API — use positional label */}
                    <p className="text-sm font-medium text-brand-800">
                      Item {idx + 1}
                    </p>
                    <p className="text-xs text-brand-400">{item.channelListingId}</p>
                    <p className="text-sm font-semibold text-brand-900">
                      {formatMoney(item.priceCents, item.currency)}
                    </p>
                  </div>
                  <RemoveFromBagButton itemId={item.id} />
                </div>
              ))}
            </CardContent>
            <CardFooter className="flex justify-between border-t border-brand-100 px-4 py-4">
              <p className="text-sm font-medium text-brand-700">Subtotal</p>
              <p className="text-base font-bold text-brand-900">
                {formatMoney(subtotalCents, currency)}
              </p>
            </CardFooter>
          </Card>

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
