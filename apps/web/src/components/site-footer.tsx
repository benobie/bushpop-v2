// Global site footer — pure RSC, zero client JS.
// Neutral/token-driven styling for a clean Launch-2 brand re-skin.
import Link from "next/link";

const FOOTER_COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Bushpop",
    links: [
      { href: "/about/", label: "About" },
      { href: "/about/how-it-works/", label: "How it works" },
      { href: "/about/buying/", label: "Buying" },
      { href: "/about/selling/", label: "Selling" },
    ],
  },
  {
    heading: "Guides",
    links: [
      { href: "/guides/size-charts/", label: "Size charts" },
      { href: "/guides/op-shops-sydney/", label: "Op shops Sydney" },
      { href: "/guides/op-shops-melbourne/", label: "Op shops Melbourne" },
      { href: "/blog/", label: "Blog" },
    ],
  },
  {
    heading: "Help",
    links: [
      { href: "/help/", label: "Help & FAQ" },
      { href: "/contact/", label: "Contact" },
      { href: "/terms/shipping/", label: "Shipping" },
      { href: "/terms/returns/", label: "Returns" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/terms/", label: "Terms & conditions" },
      { href: "/privacy-policy/", label: "Privacy policy" },
    ],
  },
];

export function SiteFooter() {
  const year = 2026;
  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading}>
              <h2 className="mb-3 text-sm font-semibold text-gray-900">{col.heading}</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-gray-600 hover:text-black">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-gray-200 pt-6 text-sm text-gray-500">
          <p className="mb-1 font-medium text-gray-700">
            Bushpop — Australia&apos;s secondhand fashion marketplace.
          </p>
          <p>
            &copy; {year} Bushpop. Preloved fashion, kept in circulation. Made in
            Australia.
          </p>
        </div>
      </div>
    </footer>
  );
}
