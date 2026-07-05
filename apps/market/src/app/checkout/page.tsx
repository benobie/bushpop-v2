/**
 * Checkout page — server shell.
 * Authed + forced dynamic.
 *
 * Fetches addresses server-side and passes them to the CheckoutFlow client island.
 * Guards empty cart → redirect /bag.
 */
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout",
};

export default async function CheckoutPage() {
  await requireAuth();

  const api = await createAuthedApiClient();

  // Fetch cart and addresses in parallel
  const [cartResult, addressesResult] = await Promise.all([
    api.GET("/api/v1/store/cart"),
    api.GET("/api/v1/addresses"),
  ]);

  // Guard: empty cart → redirect to bag
  const cart = cartResult.data;
  if (!cart || cart.items.length === 0) {
    redirect("/bag");
  }

  const addresses = addressesResult.data ?? [];

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8 sm:py-10" data-testid="checkout-page">
      <h1 className="font-[family-name:var(--font-bp-head)] text-2xl font-extrabold tracking-tight text-[var(--color-bp-ink)] sm:text-[26px]">
        Checkout
      </h1>
      <p className="mb-6 mt-1 text-sm text-[var(--color-bp-ink-2)]">
        You&rsquo;re almost there &mdash; just a couple of details and it&rsquo;s yours.
      </p>
      <CheckoutFlow addresses={addresses} cartItems={cart.items} />
    </main>
  );
}
