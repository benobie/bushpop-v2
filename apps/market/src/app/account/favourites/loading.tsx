export default function FavouritesLoading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 h-7 w-40 animate-pulse rounded bg-bp-surface-2" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-bp-line">
            <div className="aspect-[4/5] animate-pulse bg-bp-surface-2" />
            <div className="space-y-2 p-3">
              <div className="h-4 animate-pulse rounded bg-bp-surface-2" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-bp-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
