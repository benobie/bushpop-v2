/**
 * Account hub — minimal links to favourites, saved searches, orders, sign out.
 * Authed + forced dynamic (requireAuth is the RSC data-access point, so this
 * page needs its own loading.tsx per the cacheComponents Suspense gotcha).
 */
import Link from "next/link";
import { requireAuth } from "@/lib/require-auth";
import { SignOutButton } from "@/components/account/sign-out-button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your account",
};

const LINKS = [
  { href: "/account/favourites", label: "Favourites", description: "Listings you've saved" },
  { href: "/account/searches", label: "Saved searches", description: "Searches you've saved to run again" },
  { href: "/orders", label: "Orders", description: "Your purchase history" },
];

export default async function AccountPage() {
  const { user } = await requireAuth();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 font-display text-2xl font-bold text-bp-ink">Your account</h1>
      <p className="mb-8 text-sm text-bp-ink-2">{user.email}</p>

      <div className="space-y-3">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block rounded-xl border border-bp-line px-4 py-4 transition-colors hover:border-bp-line-2 hover:bg-bp-surface-2"
          >
            <p className="text-sm font-medium text-bp-ink">{link.label}</p>
            <p className="mt-0.5 text-xs text-bp-ink-2">{link.description}</p>
          </Link>
        ))}
      </div>

      <SignOutButton className="mt-8 text-sm font-medium text-bp-ink-2 underline" />
    </main>
  );
}
