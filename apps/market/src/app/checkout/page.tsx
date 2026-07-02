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
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-8 font-display text-2xl font-bold text-brand-900">
        Checkout
      </h1>
      <CheckoutFlow addresses={addresses} />
    </main>
  );
}
