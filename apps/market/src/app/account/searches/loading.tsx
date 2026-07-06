export default function SearchesLoading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 h-7 w-48 animate-pulse rounded bg-brand-100" />
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border border-brand-100 bg-brand-50" />
        ))}
      </div>
    </main>
  );
}
