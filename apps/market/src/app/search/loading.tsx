/**
 * Search loading shell — Suspense boundary so the dynamic `/search` page
 * (reads searchParams + uncached search results) can prerender under Cache
 * Components. Mirrors the search input + card grid of the loaded page.
 */
export default function SearchLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 h-12 animate-pulse rounded-lg bg-brand-100" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-[3/4] animate-pulse rounded-xl bg-brand-100" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-brand-100" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-brand-100" />
          </div>
        ))}
      </div>
    </main>
  );
}
