// Branded 404. The root layout already wraps this with the global nav + footer,
// so this only renders the page body. Pure RSC.
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

const SUGGESTIONS: { href: string; label: string }[] = [
  { href: "/guides/size-charts/", label: "Brand size charts" },
  { href: "/about/how-it-works/", label: "How Bushpop works" },
  { href: "/about/selling/", label: "Selling on Bushpop" },
  { href: "/shop/", label: "Shop" },
  { href: "/contact/", label: "Contact us" },
];

export default function NotFound() {
  return (
    <main className="shell max-w-3xl py-20">
      <p className="eyebrow mb-2">404</p>
      <h1 className="page mb-4">This page has wandered off</h1>
      <p className="muted mb-8 text-lg">
        We couldn&apos;t find the page you were after. It may have moved, or the
        link might be out of date. Try one of these instead:
      </p>
      <ul className="space-y-2">
        {SUGGESTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="font-medium text-green-bright underline">
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
