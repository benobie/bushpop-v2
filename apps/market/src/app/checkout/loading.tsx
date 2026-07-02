/**
 * Checkout loading shell — Suspense boundary so the authed, dynamic
 * `/checkout` page (reads session + cart + addresses) can prerender a static
 * shell under Cache Components.
 */
export default function CheckoutLoading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 h-8 w-40 animate-pulse rounded bg-brand-100" />
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-xl bg-brand-100" />
        <div className="h-24 animate-pulse rounded-xl bg-brand-100" />
        <div className="h-14 animate-pulse rounded-xl bg-brand-100" />
      </div>
    </main>
  );
}
