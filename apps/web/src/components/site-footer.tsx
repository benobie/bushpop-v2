// Global footer — dark 5-column, ported from the prototype footer.
// Pure RSC. Social icons are lucide glyphs; marketplace columns point at live
// content pages and the "Launching soon" storefront where no page exists yet.
import Link from "next/link";
import { Wordmark } from "./wordmark";
import { COMING_SOON, SELL_SOON } from "@/lib/links";

// lucide 1.x dropped brand marks — inline minimal brand glyphs for our own socials.
function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.17.4.37 1 .42 2.2.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.05 1.2-.25 1.8-.42 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.17-1 .37-2.2.42-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.05-1.8-.25-2.2-.42-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.17-.4-.37-1-.42-2.2C2.21 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.05-1.2.25-1.8.42-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.17 1-.37 2.2-.42C8.4 2.21 8.8 2.2 12 2.2Zm0 3.05A6.75 6.75 0 1 0 18.75 12 6.75 6.75 0 0 0 12 5.25Zm0 11.14A4.39 4.39 0 1 1 16.39 12 4.39 4.39 0 0 1 12 16.39Zm6.99-11.4a1.58 1.58 0 1 1-1.58-1.58 1.58 1.58 0 0 1 1.58 1.58Z" />
    </svg>
  );
}
function TiktokIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.77.12v-3.2a5.66 5.66 0 0 0-.77-.05A5.7 5.7 0 1 0 15.54 15.4V9.01a7.35 7.35 0 0 0 4.4 1.44V7.36a4.28 4.28 0 0 1-3.34-1.54Z" />
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12Z" />
    </svg>
  );
}

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Shop",
    links: [
      { href: COMING_SOON, label: "Browse all" },
      { href: COMING_SOON, label: "Women" },
      { href: COMING_SOON, label: "Men" },
      { href: COMING_SOON, label: "Under $50" },
    ],
  },
  {
    heading: "Sell",
    links: [
      { href: SELL_SOON, label: "Start selling" },
      { href: "/about/selling/", label: "How selling works" },
      { href: "/selling/how-to-sell-on-bushpop-the-complete-guide/", label: "Seller guide" },
      { href: "/about/verification/", label: "Verification" },
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
    heading: "Company",
    links: [
      { href: "/about/", label: "About" },
      { href: "/help/", label: "Help & FAQ" },
      { href: "/contact/", label: "Contact" },
      { href: "/terms/", label: "Terms" },
      { href: "/privacy-policy/", label: "Privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="top">
        <div className="brandcol">
          <Wordmark className="wm" />
          <p>
            Australia&apos;s secondhand fashion marketplace. Preloved vintage,
            streetwear and designer, kept in circulation.
          </p>
          <div className="socials">
            <a href="https://instagram.com" aria-label="Instagram" rel="noopener noreferrer" target="_blank">
              <InstagramIcon />
            </a>
            <a href="https://tiktok.com" aria-label="TikTok" rel="noopener noreferrer" target="_blank">
              <TiktokIcon />
            </a>
            <a href="https://facebook.com" aria-label="Facebook" rel="noopener noreferrer" target="_blank">
              <FacebookIcon />
            </a>
          </div>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.heading} className="col">
            <h5>{col.heading}</h5>
            {col.links.map((l) => (
              <Link key={`${col.heading}-${l.label}`} href={l.href}>
                {l.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="legal">
        <span>&copy; 2026 Bushpop. Preloved fashion, kept in circulation. Made in Australia.</span>
        <span>bushpop.com.au</span>
      </div>
    </footer>
  );
}
