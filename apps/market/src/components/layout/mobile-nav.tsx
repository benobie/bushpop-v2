import Link from "next/link";

/**
 * Bottom nav bar for mobile (hidden on md+).
 * Minimal scaffold — filled out when real pages land.
 */
export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-brand-200 bg-white md:hidden">
      <div className="flex h-16 items-center justify-around px-2">
        <Link
          href="/"
          className="flex flex-col items-center gap-1 text-xs text-brand-700"
        >
          <span className="text-lg">⌂</span>
          <span>Home</span>
        </Link>
        <Link
          href="/search"
          className="flex flex-col items-center gap-1 text-xs text-brand-700"
        >
          <span className="text-lg">⌕</span>
          <span>Search</span>
        </Link>
        <Link
          href="/sell"
          className="flex flex-col items-center gap-1 text-xs text-brand-700"
        >
          <span className="text-lg">+</span>
          <span>Sell</span>
        </Link>
        <Link
          href="/account"
          className="flex flex-col items-center gap-1 text-xs text-brand-700"
        >
          <span className="text-lg">◉</span>
          <span>Account</span>
        </Link>
      </div>
    </nav>
  );
}
