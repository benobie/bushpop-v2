/**
 * Orders loading shell — Suspense boundary so the authed, dynamic `/orders`
 * page (reads session + order history) can prerender a static shell under
 * Cache Components.
 */
export default function OrdersLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-6 h-8 w-36 animate-pulse rounded bg-brand-100" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-brand-100" />
        ))}
      </div>
    </main>
  );
}
