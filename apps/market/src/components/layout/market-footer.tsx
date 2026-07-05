import { SiteFooter } from "@bushpop/ui";
import { Wordmark } from "./wordmark";

// Evaluated once at module load time (build-time under Cache Components), not
// at render time — `new Date()` inside a Server Component render is treated
// as uncached dynamic data under `cacheComponents: true` and blocks
// prerender. See the old footer.tsx this replaces for the same note.
const CURRENT_YEAR = new Date().getFullYear();

interface MarketFooterProps {
  channelName: string;
  tagline: string;
  supportEmail: string;
}

/**
 * Static — no session/cart data needed, so this renders outside the
 * SiteHeader Suspense boundary and stays part of the prerenderable shell.
 * No socials yet: the marketing socials revival (M1) is gated on Ben
 * supplying credentials (D7) — an unverified/placeholder link here would be
 * exactly the kind of fixture the trust-claims ledger bans.
 */
export function MarketFooter({ channelName, tagline, supportEmail }: MarketFooterProps) {
  return (
    <SiteFooter
      logo={<Wordmark className="h-5 text-white" title={channelName} />}
      tagline={tagline}
      channelName={channelName}
      copyrightYear={CURRENT_YEAR}
      columns={[
        {
          heading: "Shop",
          links: [
            { label: "Browse", href: "/browse" },
            { label: "Sell on Bushpop", href: "/sell" },
          ],
        },
        {
          heading: "Account",
          links: [
            { label: "Sign in", href: "/sign-in" },
            { label: "Your orders", href: "/orders" },
            { label: "Your bag", href: "/bag" },
          ],
        },
        {
          heading: "Support",
          links: [{ label: "Contact us", href: `mailto:${supportEmail}` }],
        },
      ]}
    />
  );
}
