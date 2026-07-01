// Home hero — pure RSC, zero client JS.
// Structure/feel adapted from shop.app (bold split hero + a cluster of floating
// cards) but re-skinned to Bushpop's earthy palette. Since Launch 1 has no live
// product feed, the "product cards" are Bushpop's real content surfaces, so every
// tile links somewhere real. Motion is CSS-only (globals.css: .bp-rise/.bp-float,
// both disabled under prefers-reduced-motion). Token-driven for brand-lock.
import Link from "next/link";
import type { ReactNode } from "react";

type HeroCard = {
  href: string;
  eyebrow: string;
  title: string;
  meta: string;
  /** Tailwind classes for the tile fill. */
  tint: string;
  /** Decorative line glyph (aria-hidden). */
  glyph: ReactNode;
  /** Nudge for the scattered, non-gridded cluster feel. */
  offset: string;
  /** Load-in + drift stagger. */
  riseDelay: string;
  floatDelay: string;
};

const stroke = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const CARDS: HeroCard[] = [
  {
    href: "/shop/",
    eyebrow: "Browse",
    title: "Shop preloved",
    meta: "1,600+ pieces",
    tint: "bg-bushpop-green text-bushpop-cream",
    offset: "lg:translate-y-0",
    riseDelay: "0.05s",
    floatDelay: "0s",
    glyph: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden {...stroke}>
        <path d="M12 3a2 2 0 0 0-2 2c0 1 .8 1.6 2 2.2" />
        <path d="M4 14 12 8l8 6" />
        <path d="M4 14v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
      </svg>
    ),
  },
  {
    href: "/guides/size-charts/",
    eyebrow: "Guides",
    title: "Brand size charts",
    meta: "Fit, decoded",
    tint: "bg-white text-bushpop-ink",
    offset: "lg:translate-y-8",
    riseDelay: "0.15s",
    floatDelay: "1.4s",
    glyph: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden {...stroke}>
        <rect x="3" y="8" width="18" height="8" rx="1.5" />
        <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
      </svg>
    ),
  },
  {
    href: "/guides/op-shops-sydney/",
    eyebrow: "Local",
    title: "Op-shop guides",
    meta: "Syd · Melb · Bris +",
    tint: "bg-bushpop-sage text-bushpop-ink",
    offset: "lg:-translate-y-4",
    riseDelay: "0.25s",
    floatDelay: "0.7s",
    glyph: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden {...stroke}>
        <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z" />
        <circle cx="12" cy="11" r="2.2" />
      </svg>
    ),
  },
  {
    href: "/about/selling/",
    eyebrow: "Sellers",
    title: "Sell on Bushpop",
    meta: "Start a shop",
    tint: "bg-bushpop-rust text-bushpop-cream",
    offset: "lg:translate-y-6",
    riseDelay: "0.35s",
    floatDelay: "2.1s",
    glyph: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden {...stroke}>
        <path d="M4 9 5 5h14l1 4" />
        <path d="M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
        <path d="M5 11v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
      </svg>
    ),
  },
];

export function HomeHero() {
  return (
    <section className="relative isolate overflow-hidden bg-bushpop-cream">
      {/* Single soft brand blob for depth — the only decorative flourish. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 -z-10 h-[36rem] w-[36rem] rounded-full bg-bushpop-green/10 blur-3xl"
      />

      <div className="mx-auto grid max-w-5xl items-center gap-12 px-6 py-20 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:py-28">
        {/* Left — the pitch */}
        <div>
          <p
            className="bp-rise text-xs font-semibold uppercase tracking-[0.18em] text-bushpop-green"
            style={{ "--bp-delay": "0s" } as React.CSSProperties}
          >
            Australia's secondhand fashion marketplace
          </p>

          <h1
            className="bp-rise mt-4 text-5xl leading-[1.02] tracking-tight text-bushpop-ink sm:text-6xl lg:text-7xl"
            style={{
              fontFamily: "var(--font-display)",
              "--bp-delay": "0.08s",
            } as React.CSSProperties}
          >
            Preloved fashion,{" "}
            <span className="italic text-bushpop-rust underline decoration-bushpop-rust/40 decoration-4 underline-offset-[6px]">
              worth the hunt
            </span>
            .
          </h1>

          <p
            className="bp-rise mt-6 max-w-md text-lg leading-relaxed text-bushpop-ink/70"
            style={{ "--bp-delay": "0.16s" } as React.CSSProperties}
          >
            One-of-a-kind pieces from Australian sellers — plus the guides to
            shop them right.
          </p>

          <div
            className="bp-rise mt-8 flex flex-wrap items-center gap-3"
            style={{ "--bp-delay": "0.24s" } as React.CSSProperties}
          >
            <Link
              href="/shop/"
              className="rounded-full bg-bushpop-green px-6 py-3 text-sm font-semibold text-bushpop-cream transition-colors hover:bg-bushpop-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bushpop-ink"
            >
              Shop preloved
            </Link>
            <Link
              href="/guides/size-charts/"
              className="rounded-full border border-bushpop-green/40 px-6 py-3 text-sm font-semibold text-bushpop-green transition-colors hover:border-bushpop-green hover:bg-bushpop-green/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bushpop-green"
            >
              Browse size guides
            </Link>
          </div>

          <p
            className="bp-rise mt-8 text-sm text-bushpop-ink/55"
            style={{ "--bp-delay": "0.32s" } as React.CSSProperties}
          >
            1,600+ pieces · Australian sellers · Circular by design
          </p>
        </div>

        {/* Right — the floating cluster (real content surfaces) */}
        <ul className="grid grid-cols-2 gap-4 sm:gap-5">
          {CARDS.map((card) => (
            <li
              key={card.href}
              className={`bp-rise ${card.offset}`}
              style={{ "--bp-delay": card.riseDelay } as React.CSSProperties}
            >
              <div
                className="bp-float"
                style={{ "--bp-delay": card.floatDelay } as React.CSSProperties}
              >
                <Link
                  href={card.href}
                  className={`group flex h-full flex-col justify-between gap-6 rounded-2xl p-5 shadow-sm ring-1 ring-black/5 transition-transform duration-200 hover:-translate-y-1 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bushpop-ink ${card.tint}`}
                >
                  <span className="flex items-center justify-between">
                    <span className="opacity-80">{card.glyph}</span>
                    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] opacity-60">
                      {card.eyebrow}
                    </span>
                  </span>
                  <span>
                    <span
                      className="block text-lg font-semibold leading-tight"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {card.title}
                    </span>
                    <span className="mt-1 block text-sm opacity-70">
                      {card.meta}
                      <span className="ml-1 inline-block transition-transform group-hover:translate-x-0.5">
                        →
                      </span>
                    </span>
                  </span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
