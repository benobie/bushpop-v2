export default function DetailsLoading() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="h-6 w-64 animate-pulse rounded bg-brand-100" />
      <div className="mt-8 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-brand-100" />
        ))}
      </div>
    </main>
  );
}
