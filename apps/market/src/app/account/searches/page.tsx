/**
 * Saved searches — buyer's saved PLP filter/query combinations.
 * Authed + forced dynamic.
 */
import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { SearchesList } from "./searches-list";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saved searches",
};

export default async function SavedSearchesPage() {
  await requireAuth();

  const api = await createAuthedApiClient();
  const { data, error } = await api.GET("/api/v1/customer/saved-searches");

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-center text-brand-500">Could not load your saved searches. Please try again.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 font-display text-2xl font-bold text-brand-900">Saved searches</h1>
      <SearchesList items={data?.items ?? []} />
    </main>
  );
}
