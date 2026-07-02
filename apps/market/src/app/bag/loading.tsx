/**
 * Bag loading shell — Suspense boundary so the authed, dynamic `/bag` page
 * (reads the session + cart via createAuthedApiClient) can prerender a static
 * shell under Cache Components and stream the cart in.
 */
export default function BagLoading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-brand-100" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-brand-100" />
        ))}
      </div>
      <div className="mt-8 h-14 animate-pulse rounded-xl bg-brand-100" />
    </main>
  );
}
