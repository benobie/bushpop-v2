// Global navigation — frosted sticky, ported from the prototype .nav.
// Pure RSC: the search box and marketplace icons route to the "Launching soon"
// storefront (no live shop yet). NavScrollBorder is the one client leaf
// (borderless-until-scroll); the mobile menu defaults to a zero-JS <details>
// disclosure — pass `drawerNav` to swap in the slide-in MobileNavDrawer
// (Ben's call for the content site, see the PR body — defaulted OFF).
import Link from "next/link";
import { MagnifyingGlass, Heart, ShoppingBag, List, PlusCircle } from "@phosphor-icons/react/dist/ssr";
import { Wordmark } from "./wordmark";
import { Button } from "./button";
import { NavScrollBorder } from "./nav-scroll-border";
import { MobileNavDrawer } from "./mobile-nav-drawer";
import { COMING_SOON, SELL_SOON, BAG_SOON } from "@/lib/links";

const LINKS: { href: string; label: string }[] = [
  { href: "/guides/size-charts/", label: "Size charts" },
  { href: "/guides/op-shops-sydney/", label: "Guides" },
  { href: "/about/", label: "About" },
  { href: "/help/", label: "Help" },
];

export function SiteNav({ drawerNav = false }: { drawerNav?: boolean }) {
  return (
    <header className="nav">
      <NavScrollBorder />
      <div className="inner">
        {drawerNav && <MobileNavDrawer links={LINKS} sellHref={SELL_SOON} />}

        <Link href="/" aria-label="Bushpop home">
          <Wordmark className="wm" />
        </Link>

        <Link href={COMING_SOON} className="search" aria-label="Search preloved (launching soon)">
          <MagnifyingGlass size={16} weight="bold" />
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
            <Heart size={18} weight="bold" />
          </Link>
          <Link href={BAG_SOON} className="ic" aria-label="Bag (launching soon)">
            <ShoppingBag size={18} weight="bold" />
          </Link>

          <span className="hidden sm:inline-flex">
            <Button href={SELL_SOON} variant="green">
              <PlusCircle size={16} weight="bold" />
              Sell now
            </Button>
          </span>

          {/* Default mobile menu — zero-JS disclosure (drawerNav=false) */}
          {!drawerNav && (
            <details className="relative md:hidden">
              <summary className="ic list-none" aria-label="Menu">
                <List size={20} weight="bold" />
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
                      className="block rounded-lg px-3 py-2 font-semibold text-green-bright hover:bg-surface"
                    >
                      Sell now
                    </Link>
                  </li>
                </ul>
              </nav>
            </details>
          )}
        </div>
      </div>
    </header>
  );
}
