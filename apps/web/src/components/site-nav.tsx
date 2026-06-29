// Global site navigation — pure RSC, zero client JS.
// Mobile menu uses a native <details>/<summary> disclosure so there is no
// hydration cost (content pages stay zero-JS for Core Web Vitals).
// Styling is intentionally neutral/token-driven so the Launch-2 brand system
// can re-skin it by swapping the CSS variables in globals.css.
import Link from "next/link";

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/about/", label: "About" },
  { href: "/guides/size-charts/", label: "Size charts" },
  { href: "/about/selling/", label: "Sell" },
  { href: "/shop/", label: "Shop" },
  { href: "/help/", label: "Help" },
  { href: "/contact/", label: "Contact" },
];

export function SiteNav() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Bushpop
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-6 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-gray-700 hover:text-black">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Mobile nav — no-JS disclosure */}
        <details className="relative md:hidden">
          <summary
            className="cursor-pointer list-none rounded border border-gray-300 px-3 py-1.5 text-sm"
            aria-label="Toggle menu"
          >
            Menu
          </summary>
          <nav
            aria-label="Mobile"
            className="absolute right-0 z-10 mt-2 w-48 rounded border border-gray-200 bg-white p-2 shadow-lg"
          >
            <ul className="flex flex-col gap-1 text-sm">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block rounded px-2 py-1.5 text-gray-700 hover:bg-gray-50 hover:text-black"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
