export default function ReviewLoading() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="h-6 w-64 animate-pulse rounded bg-brand-100" />
      <div className="mt-8 space-y-4">
        <div className="h-64 w-48 animate-pulse rounded-xl bg-brand-100" />
        <div className="h-32 animate-pulse rounded-xl bg-brand-100" />
      </div>
    </main>
  );
}
