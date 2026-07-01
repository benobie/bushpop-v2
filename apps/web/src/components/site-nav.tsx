// Global navigation — frosted sticky, ported from the prototype .nav.
// Pure RSC: the search box and marketplace icons route to the "Launching soon"
// storefront (no live shop yet). Mobile menu is a zero-JS <details> disclosure.
import Link from "next/link";
import { Search, Heart, ShoppingBag, Menu } from "lucide-react";
import { Wordmark } from "./wordmark";
import { Button } from "./button";
import { COMING_SOON, SELL_SOON, BAG_SOON } from "@/lib/links";

const LINKS: { href: string; label: string }[] = [
  { href: "/guides/size-charts/", label: "Size charts" },
  { href: "/guides/op-shops-sydney/", label: "Guides" },
  { href: "/about/", label: "About" },
  { href: "/help/", label: "Help" },
];

export function SiteNav() {
  return (
    <header className="nav">
      <div className="inner">
        <Link href="/" aria-label="Bushpop home">
          <Wordmark className="wm" />
        </Link>

        <Link href={COMING_SOON} className="search" aria-label="Search preloved (launching soon)">
          <Search size={16} strokeWidth={2} />
          <span>Search preloved…</span>
        </Link>

        <div className="right">
          <nav aria-label="Primary" className="hidden md:flex md:items-center md:gap-4">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>

          <Link href={COMING_SOON} className="ic" aria-label="Saved (launching soon)">
            <Heart size={18} strokeWidth={2} />
          </Link>
          <Link href={BAG_SOON} className="ic" aria-label="Bag (launching soon)">
            <ShoppingBag size={18} strokeWidth={2} />
          </Link>

          <span className="hidden sm:inline-flex">
            <Button href={SELL_SOON} variant="green">
              Sell now
            </Button>
          </span>

          {/* Mobile menu — zero-JS disclosure */}
          <details className="relative md:hidden">
            <summary className="ic list-none" aria-label="Menu">
              <Menu size={20} strokeWidth={2} />
            </summary>
            <nav
              aria-label="Mobile"
              className="absolute right-0 z-10 mt-2 w-52 rounded-2xl border border-line bg-white p-2 shadow-lg"
            >
              <ul className="flex flex-col text-sm">
                {LINKS.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="block rounded-lg px-3 py-2 text-ink hover:bg-surface"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href={SELL_SOON}
                    className="block rounded-lg px-3 py-2 font-semibold text-green-ink hover:bg-surface"
                  >
                    Sell now
                  </Link>
                </li>
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
