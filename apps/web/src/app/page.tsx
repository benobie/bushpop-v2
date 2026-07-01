// Pure RSC — no "use client". Content pages stay zero-JS for CWV.
import Link from "next/link";
import { HomeHero } from "@/components/home-hero";

const PILLARS: { title: string; body: string; href: string; cta: string }[] = [
  {
    title: "Shop the racks",
    body: "Preloved clothing and accessories from Australian sellers, kept in circulation and out of landfill.",
    href: "/shop/",
    cta: "Browse the shop",
  },
  {
    title: "Buy the right fit",
    body: "Web-verified brand size charts so you know it fits before it ships — no guesswork, no returns runaround.",
    href: "/guides/size-charts/",
    cta: "See size charts",
  },
  {
    title: "Hunt off-line too",
    body: "City-by-city op-shop guides for when you want to thrift the racks yourself, from Sydney to Perth.",
    href: "/guides/op-shops-sydney/",
    cta: "Read the guides",
  },
];

export default function HomePage() {
  return (
    <main>
      <HomeHero />

      <section className="border-t border-bushpop-ink/10 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2
            className="text-2xl font-semibold tracking-tight text-bushpop-ink sm:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            A better way to buy secondhand
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {PILLARS.map((p) => (
              <div key={p.href} className="flex flex-col">
                <h3
                  className="text-lg font-semibold text-bushpop-ink"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {p.title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-bushpop-ink/70">
                  {p.body}
                </p>
                <Link
                  href={p.href}
                  className="mt-4 text-sm font-semibold text-bushpop-green underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bushpop-green"
                >
                  {p.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
