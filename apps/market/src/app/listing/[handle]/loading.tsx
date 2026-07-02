export default function PDPLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <div className="aspect-[3/4] animate-pulse rounded-xl bg-brand-100" />
        <div className="space-y-4">
          <div className="h-4 w-24 animate-pulse rounded bg-brand-100" />
          <div className="h-8 w-3/4 animate-pulse rounded bg-brand-100" />
          <div className="h-10 w-32 animate-pulse rounded bg-brand-100" />
          <div className="h-14 animate-pulse rounded-xl bg-brand-100" />
          <div className="h-12 animate-pulse rounded-lg bg-brand-100" />
        </div>
      </div>
    </main>
  );
}
