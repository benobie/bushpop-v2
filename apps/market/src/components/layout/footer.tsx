import Link from "next/link";

// Evaluated once at module load time (build-time under Cache Components),
// not at render time. `new Date()` inside a Server Component render is
// treated as uncached dynamic data under `cacheComponents: true` and
// blocks prerender. Module-scope evaluation sidesteps the check — the
// copyright year updates on every deploy, which is fine.
const CURRENT_YEAR = new Date().getFullYear();

interface FooterProps {
  channelName: string;
  supportEmail: string;
}

export function Footer({ channelName, supportEmail }: FooterProps) {
  return (
    <footer className="border-t border-brand-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-brand-800">
              {channelName}
            </h3>
            <p className="mt-2 text-sm text-brand-500">
              Preloved fashion marketplace
            </p>
          </div>
          <div>
            <h4 className="font-display text-sm font-semibold text-brand-800">
              Shop
            </h4>
            <ul className="mt-2 space-y-1 text-sm text-brand-600">
              <li>
                <Link href="/browse" className="hover:text-brand-800">
                  Browse
                </Link>
              </li>
              <li>
                <Link href="/sell" className="hover:text-brand-800">
                  Sell
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-display text-sm font-semibold text-brand-800">
              Account
            </h4>
            <ul className="mt-2 space-y-1 text-sm text-brand-600">
              <li>
                <Link href="/sign-in" className="hover:text-brand-800">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/orders" className="hover:text-brand-800">
                  Orders
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-display text-sm font-semibold text-brand-800">
              Support
            </h4>
            <ul className="mt-2 space-y-1 text-sm text-brand-600">
              <li>
                <a
                  href={`mailto:${supportEmail}`}
                  className="hover:text-brand-800"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-brand-100 pt-4 text-xs text-brand-400">
          © {CURRENT_YEAR} {channelName}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
