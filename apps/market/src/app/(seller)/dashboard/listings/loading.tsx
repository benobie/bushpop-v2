export default function DashboardListingsLoading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div className="h-7 w-32 animate-pulse rounded bg-bp-surface-2" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-bp-surface-2" />
      </div>
      <div className="mt-6 flex gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 w-16 animate-pulse rounded-full bg-bp-surface-2" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-bp-line">
            <div className="aspect-square animate-pulse bg-bp-surface-2" />
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
