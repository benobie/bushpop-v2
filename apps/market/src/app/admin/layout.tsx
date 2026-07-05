import Link from "next/link";

// NOTE: the admin role gate (`requireAdmin()`) is NOT called here — this
// layout renders outside any per-page Suspense boundary, and an uncached
// authed fetch there hard-fails the build under this app's cacheComponents
// config ("Uncached data was accessed outside of <Suspense>" — see
// apps/market gotchas in bushpop-v2/.claude/CLAUDE.md re: loading.tsx).
// Every page.tsx under /admin calls requireAdmin() itself instead, exactly
// like the existing /bulk-listing pages do.
const NAV = [
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/ai-usage", label: "AI usage" },
  { href: "/admin/fees", label: "Fees" },
  { href: "/admin/email-jobs", label: "Failed emails" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href="/admin/orders" className="text-lg font-bold text-brand-900">
          Bushpop admin
        </Link>
        <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
          internal — v1 read-first
        </span>
      </div>
      <nav className="mt-4 flex flex-wrap gap-1 border-b border-brand-100 pb-2 text-sm">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded px-3 py-1.5 text-brand-600 hover:bg-brand-50 hover:text-brand-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export const metadata = { title: "Admin — Internal" };
