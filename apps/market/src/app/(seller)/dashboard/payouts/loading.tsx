export default function DashboardPayoutsLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="h-7 w-32 animate-pulse rounded bg-bp-surface-2" />
      <div className="mt-6 grid grid-cols-2 gap-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border border-bp-line bg-bp-surface-2" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-bp-line bg-bp-surface-2" />
        ))}
      </div>
    </main>
  );
}
