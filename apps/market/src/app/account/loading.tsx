export default function AccountLoading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-1 h-7 w-40 animate-pulse rounded bg-bp-surface-2" />
      <div className="mb-8 h-4 w-48 animate-pulse rounded bg-bp-surface-2" />
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border border-bp-line bg-bp-surface-2" />
        ))}
      </div>
    </main>
  );
}
