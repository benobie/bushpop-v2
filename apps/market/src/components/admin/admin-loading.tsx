export function AdminLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-12 text-sm text-bp-ink-2">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-bp-ink-3 border-t-transparent" />
      {label}…
    </div>
  );
}
