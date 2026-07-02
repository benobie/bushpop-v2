/**
 * Confirmation loading shell — Suspense boundary so the dynamic
 * `/checkout/confirmation` page (reads searchParams: session + redirect_status)
 * can prerender under Cache Components while the order poll resolves.
 */
export default function ConfirmationLoading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      <div className="mx-auto mb-3 h-6 w-48 animate-pulse rounded bg-brand-100" />
      <div className="mx-auto h-4 w-64 animate-pulse rounded bg-brand-100" />
    </main>
  );
}
