/**
 * Buyer pickup-collection-code page — standalone route, deliberately NOT
 * wired into /orders/[id]/page.tsx yet (that file is owned by an in-flight
 * PR at authoring time; docs/BRIEF-shipping-performance.md §4 slice, batch
 * 43D). Follow-up: add a link from the order-detail page once that PR merges.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { Button } from "@bushpop/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Collection Code",
};

interface PickupCodePageProps {
  params: Promise<{ id: string }>;
}

export default async function PickupCodePage({ params }: PickupCodePageProps) {
  await requireAuth();

  const { id } = await params;

  const api = await createAuthedApiClient();
  const { data, error } = await api.GET("/api/v1/store/orders/{id}/pickup-code", {
    params: { path: { id } },
  });

  if (error && !data) {
    const message =
      typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message)
        : null;

    // Distinguish "not a pickup order / not found" (genuinely 404) from
    // "already collected" (a real order in a terminal state) rather than
    // notFound()-ing every non-200.
    if (message?.toLowerCase().includes("collected")) {
      return (
        <main className="mx-auto max-w-md px-4 py-12 text-center">
          <h1 className="font-display text-xl font-bold text-brand-900">Already collected</h1>
          <p className="mt-2 text-sm text-brand-600">
            This order has already been picked up. There&apos;s nothing more to show here.
          </p>
          <Button asChild variant="ghost" size="sm" className="mt-6">
            <Link href={`/orders/${id}`}>← Back to order</Link>
          </Button>
        </main>
      );
    }
    notFound();
  }

  if (!data) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/orders/${id}`}>← Back to order</Link>
      </Button>

      <div className="mt-6 rounded-xl border border-brand-200 bg-white p-6 text-center">
        <h1 className="font-display text-lg font-bold text-brand-900">Your collection code</h1>
        <p className="mt-2 text-sm text-brand-600">
          Show this code to the seller after you&apos;ve inspected the item, in person, to confirm
          you&apos;ve received it. Sharing it before you have the item is at your own risk — it
          works like signing for a parcel.
        </p>
        <p className="mt-6 font-mono text-4xl font-bold tracking-[0.3em] text-brand-900">
          {data.code}
        </p>
        <p className="mt-4 text-xs text-brand-500">
          Lost your code? It stays the same every time you load this page — no need to note it
          down early. If you truly can&apos;t access this page, contact support.
        </p>
      </div>
    </main>
  );
}
