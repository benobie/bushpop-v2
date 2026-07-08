/**
 * Order-detail loading shell — Suspense boundary so the authed, dynamic
 * `/orders/[id]` page (reads session + a single order) can prerender a static
 * shell under Cache Components.
 */
export default function OrderDetailLoading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-bp-surface-2" />
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-xl bg-bp-surface-2" />
        <div className="h-24 animate-pulse rounded-xl bg-bp-surface-2" />
      </div>
    </main>
  );
}
