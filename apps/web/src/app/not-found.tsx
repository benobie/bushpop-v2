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
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="mb-2 text-sm font-medium text-gray-500">404</p>
      <h1 className="mb-4 text-4xl font-bold">This page has wandered off</h1>
      <p className="mb-8 text-lg text-gray-600">
        We couldn&apos;t find the page you were after. It may have moved, or the
        link might be out of date. Try one of these instead:
      </p>
      <ul className="space-y-2">
        {SUGGESTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="text-blue-600 underline">
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
