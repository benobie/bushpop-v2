/**
 * Pickup-code loading shell — Suspense boundary so the authed, dynamic
 * `/orders/[id]/pickup-code` page can prerender a static shell under Cache
 * Components (same convention as the sibling order-detail page).
 */
export default function PickupCodeLoading() {
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-brand-100" />
      <div className="h-40 animate-pulse rounded-xl bg-brand-100" />
    </main>
  );
}
