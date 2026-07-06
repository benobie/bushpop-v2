/**
 * Favourites — buyer's wishlisted listings.
 * Authed + forced dynamic.
 */
import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { FavouritesGrid } from "./favourites-grid";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Favourites",
};

export default async function FavouritesPage() {
  await requireAuth();

  const api = await createAuthedApiClient();
  const { data, error } = await api.GET("/api/v1/customer/wishlist", {
    params: { query: { limit: 50 } },
  });

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-center text-brand-500">Could not load your favourites. Please try again.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 font-display text-2xl font-bold text-brand-900">Favourites</h1>
      <FavouritesGrid items={data?.items ?? []} />
    </main>
  );
}
