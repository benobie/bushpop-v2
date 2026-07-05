export default function DashboardOrdersLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="h-7 w-40 animate-pulse rounded bg-brand-100" />
      <div className="mt-6 flex gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 w-20 animate-pulse rounded-full bg-brand-100" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-brand-100 bg-brand-50" />
        ))}
      </div>
    </main>
  );
}
