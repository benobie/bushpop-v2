export default function SellLoading() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center justify-center px-4 py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      <p className="mt-4 text-sm text-brand-500">Setting up your listing…</p>
    </main>
  );
}
