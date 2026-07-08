export default function DashboardListingDetailLoading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="h-4 w-24 animate-pulse rounded bg-bp-surface-2" />
      <div className="mt-3 h-7 w-64 animate-pulse rounded bg-bp-surface-2" />
      <div className="mt-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border border-bp-line bg-bp-surface-2" />
        ))}
      </div>
    </main>
  );
}
