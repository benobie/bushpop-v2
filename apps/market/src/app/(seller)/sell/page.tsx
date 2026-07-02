import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";

/**
 * Wizard entry point. Reuses an existing empty draft if one exists,
 * otherwise creates a new inventory item and redirects to the photos step.
 */
export default async function SellPage() {
  await requireAuth();

  const api = await createAuthedApiClient();

  // Check for an existing empty draft to reuse (prevents orphan items on refresh/back-nav)
  const { data: existing } = await api.GET("/api/v1/seller/inventory", {
    params: { query: { limit: 1, status: "draft" } },
  });

  const emptyDraft = existing?.items?.find(
    (item: { images?: unknown[]; title?: string | null }) =>
      (!item.images || item.images.length === 0) && !item.title,
  );

  if (emptyDraft) {
    redirect(`/sell/${emptyDraft.id}/photos`);
  }

  const { data, error } = await api.POST("/api/v1/seller/inventory", {
    body: {},
  });

  if (error || !data) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-red-700">Could not start listing</h1>
        <p className="mt-2 text-sm text-brand-500">
          Something went wrong. Please try again.
        </p>
        <a
          href="/sell"
          className="mt-6 inline-block rounded-lg bg-brand-700 px-6 py-2.5 text-sm font-semibold text-white"
        >
          Try again
        </a>
      </main>
    );
  }

  redirect(`/sell/${data.id}/photos`);
}

export const metadata = { title: "Start listing — Sell" };
