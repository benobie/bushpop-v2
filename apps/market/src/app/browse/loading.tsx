/**
 * Browse loading shell — provides the Suspense boundary that lets the dynamic
 * `/browse` page (reads searchParams) prerender under Cache Components.
 * Mirrors the card-grid layout of the loaded page.
 */
export default function BrowseLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 h-8 w-40 animate-pulse rounded bg-bp-surface-2" />
      <div className="mb-8 h-12 animate-pulse rounded-lg bg-bp-surface-2" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-[3/4] animate-pulse rounded-xl bg-bp-surface-2" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-bp-surface-2" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-bp-surface-2" />
          </div>
        ))}
      </div>
    </main>
  );
}
