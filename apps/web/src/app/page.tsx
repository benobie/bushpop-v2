// Homepage — the approved prototype (bushpop-home-v2.html) ported to RSC, with
// "coming-soon" framing: demo products are illustrative and every marketplace
// action routes to the "Launching soon" storefront (see @/lib/links). Only the
// Fresh-drops filter, product hearts and waitlist form hydrate as client islands.
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  MagnifyingGlass,
  Shield,
  Lightning,
  Tag,
  Package,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { ProductCard } from "@/components/product-card";
import { FreshDrops } from "@/components/fresh-drops";
import { WaitlistForm } from "@/components/waitlist-form";
import { MobileBottomBar } from "@/components/mobile-bottom-bar";
import { SouthernCrossIcon } from "@/components/icons";
import { BRANDS, RECENTLY_VIEWED, STYLES } from "@/lib/demo-products";
import { COMING_SOON, SELL_SOON } from "@/lib/links";

// Title/description come from the root layout defaults; the homepage only
// needs the canonical, which pageMeta() would otherwise override with a
// templated title.
export const metadata: Metadata = {
  alternates: { canonical: "https://bushpop.com.au/" },
};

const MARQUEE_POOL = [
  "/demo/tnf-puffer.jpg", "/demo/puffer-model.jpg", "/demo/salomon.jpg", "/demo/gazelle.jpg",
  "/demo/nike-tn.jpg", "/demo/birkenstock.jpg", "/demo/vint1.jpg", "/demo/vint2.jpg",
  "/demo/vint3.jpg", "/demo/vint4.jpg", "/demo/salomon2.jpg", "/demo/tnf-puffer2.jpg",
];

const QUICK_PATHS = ["Women", "Men", "Vintage", "Streetwear", "Outdoors", "Designer", "Sneakers", "Under $50"];
const HERO_CHIPS = ["Women", "Men", "Vintage", "Streetwear", "Sneakers", "Under $50"];

// Trust-claims gate (02/07/2026): honest, whitelisted claims only. No member
// counts, ratings, review counts, testimonials, "top-rated" language or invented
// numbers anywhere on this page. Every removed claim + its reinstatement
// condition is recorded in docs/trust-claims-ledger.md (repo root). Check the
// whitelist there before adding any trust or social-proof copy back.
const TRUST = [
  { Icon: Shield, label: "Buyer Protection on every order" },
  { Icon: Tag, label: "Free to list" },
  { Icon: Package, label: "Sellers ship direct" },
  { Icon: SouthernCrossIcon, label: "Human support, based in Australia" },
];

const SELLER_BENEFITS = [
  { Icon: Lightning, title: "List for free", body: "Photograph your pieces, set a price and publish. No listing fees." },
  { Icon: Tag, title: "Free to list", body: "1.75% + 30¢ only when it sells — nothing until then." },
  { Icon: Package, title: "You ship direct", body: "Post the order straight to the buyer once it sells." },
  { Icon: SouthernCrossIcon, title: "Human support", body: "Real people, based in Australia, at support@bushpop.com.au." },
];

const HOW_IT_WORKS = [
  { step: "1", title: "List for free.", body: "Sellers photograph their preloved pieces and list them at no cost." },
  { step: "2", title: "Buy with protection.", body: "Buyers pay the item price plus a 4% + 50¢ Buyer Protection fee on posted orders — free for local pickup." },
  { step: "3", title: "Shipped direct.", body: "The seller posts your order straight to you." },
];

const FACTS = [
  { title: "Free to list", body: "No listing fees — 1.75% + 30¢ only when it sells." },
  { title: "Buyer Protection on every order", body: "A 4% + 50¢ Buyer Protection fee is added at checkout on posted orders — free for local pickup, and every purchase is covered." },
  { title: "Sellers ship direct", body: "Your order comes straight from the seller's wardrobe to your door." },
  { title: "Australian owned and based", body: "A P2P marketplace for preloved fashion, trading since 2024." },
];

function MarqueeRow({ offset, reverse, duration }: { offset: number; reverse?: boolean; duration: number }) {
  const tiles = [...MARQUEE_POOL.slice(offset), ...MARQUEE_POOL.slice(0, offset)];
  const doubled = [...tiles, ...tiles];
  return (
    <div className={`marquee-row${reverse ? " rev" : ""}`} style={{ animationDuration: `${duration}s` }} aria-hidden="true">
      {doubled.map((src, i) => (
        <div key={`${src}-${i}`} className="marquee-tile">
          <Image src={src} alt="" width={132} height={165} sizes="132px" />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <main>
      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden bg-surface-alt">
        <div className="marquee absolute inset-0 opacity-60 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]" style={{ paddingTop: 24, paddingBottom: 24 }}>
          <MarqueeRow offset={0} duration={60} />
          <MarqueeRow offset={4} reverse duration={75} />
          <MarqueeRow offset={8} duration={68} />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/40 via-white/10 to-white/70" />
        <div className="shell relative flex flex-col items-center py-20 text-center sm:py-28">
          <div className="w-full max-w-2xl rounded-[26px] border border-line bg-white/75 p-8 shadow-[0_24px_60px_-24px_rgba(20,30,24,0.3)] backdrop-blur-xl sm:p-10">
            <div className="eyebrow mb-3">Preview · marketplace launching soon</div>
            <h1 className="page">
              Bring <span className="text-green-bright">joy</span> to your wardrobe
            </h1>
            <p className="muted mx-auto mt-4 max-w-lg text-[17px]">
              Vintage, streetwear and designer. Preloved, from sellers right across Australia.
            </p>
            <Link href={COMING_SOON} className="search mx-auto mt-6 !max-w-md" aria-label="Search preloved (launching soon)">
              <MagnifyingGlass size={16} weight="bold" />
              <span>Search brands, styles, sizes…</span>
            </Link>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {HERO_CHIPS.map((c) => (
                <Chip key={c} href={COMING_SOON}>{c}</Chip>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button href={COMING_SOON} variant="green" size="lg">Shop preloved</Button>
              <Button href={SELL_SOON} variant="ghost" size="lg">Start selling</Button>
            </div>
            <p className="mt-5 text-xs text-ink-3">
              Preloved fashion, bought and sold Australia-wide. Trading since 2024.
            </p>
          </div>
        </div>
      </section>

      {/* ===== Trust microbar ===== */}
      <section className="border-b border-line bg-white">
        <div className="shell flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-4 text-sm text-ink-2">
          {TRUST.map(({ Icon, label }) => (
            <span key={label} className="inline-flex items-center gap-2">
              <Icon size={16} weight="bold" className="text-green-bright" />
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* ===== Quick paths ===== */}
      <section className="shell py-6">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {QUICK_PATHS.map((c) => (
            <Chip key={c} href={COMING_SOON} deal={c === "Under $50"}>{c}</Chip>
          ))}
        </div>
      </section>

      {/* ===== Fresh drops ===== */}
      <section className="shell py-8">
        <div className="eyebrow">Just listed</div>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h2 className="sec">Fresh drops</h2>
          <Link href={COMING_SOON} className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-bright">
            See everything <ArrowRight size={15} weight="bold" />
          </Link>
        </div>
        <FreshDrops />
        <p className="mt-4 text-xs text-ink-3">Illustrative preview. Live listings arrive at launch.</p>
      </section>

      {/* ===== Shop by brand ===== */}
      <section className="bg-surface py-10">
        <div className="shell">
          <div className="eyebrow">The labels you know</div>
          <h2 className="sec mb-5">Shop by brand</h2>
          <div className="flex flex-wrap gap-2">
            {BRANDS.map((b) => (
              <Chip key={b} href={COMING_SOON}>{b}</Chip>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Shop by style ===== */}
      <section className="shell py-10">
        <div className="eyebrow">Find your vibe</div>
        <h2 className="sec mb-5">Shop by style</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STYLES.map((s) => (
            <Link key={s.label} href={COMING_SOON} className="group relative block aspect-[4/5] overflow-hidden rounded-[18px]">
              {s.img ? (
                <Image src={s.img} alt={s.label} fill sizes="(max-width:980px) 46vw, 280px" className="object-cover transition-transform duration-300 group-hover:scale-105" />
              ) : (
                <span className="absolute inset-0 bg-ink" />
              )}
              <span className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
              <span className="absolute bottom-4 left-4 font-head text-lg font-extrabold text-white">{s.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ===== How Bushpop works ===== */}
      <section className="bg-surface py-10">
        <div className="shell">
          <div className="eyebrow">Simple by design</div>
          <h2 className="sec mb-5">How Bushpop works</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.step} className="rounded-[18px] border border-line bg-white p-5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-surface font-head text-sm font-bold text-green-bright">{s.step}</span>
                <div className="mt-3 font-head text-sm font-bold">{s.title}</div>
                <p className="mt-1 text-sm text-ink-2">{s.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-ink-2">
            Questions? We answer them ourselves: support@bushpop.com.au.
          </p>
          <div className="mt-6 flex justify-center">
            <Button href={SELL_SOON} variant="dark" size="lg">Open a store &amp; trade</Button>
          </div>
        </div>
      </section>

      {/* ===== Product facts ===== */}
      <section className="shell py-12 text-center">
        <h2 className="sec">What you can count on</h2>
        <p className="muted mx-auto mt-2 max-w-xl">
          Every order is covered by Buyer Protection, with human support based in
          Australia when you need it. Reach us any time at support@bushpop.com.au.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.title} className="rounded-[18px] bg-surface p-5">
              <div className="font-head text-base font-extrabold">{f.title}</div>
              <p className="mt-1 text-sm text-ink-2">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Seller acquisition panel ===== */}
      <section className="py-12" style={{ background: "linear-gradient(135deg,#0f1a13,#0b0d0c)" }}>
        <div className="shell grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="eyebrow !text-[#79e0a0]">Sell with Bushpop</div>
            <h2 className="font-head text-3xl font-extrabold text-white">Turn your wardrobe into cash</h2>
            <p className="mt-3 max-w-md text-[#a9b1ac]">
              List for free and post it straight to the buyer. Just 1.75% + 30¢ when it sells.
            </p>
            <Button href={SELL_SOON} variant="green" size="lg" className="mt-6">Start listing free</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {SELLER_BENEFITS.map(({ Icon, title, body }) => (
              <div key={title} className="rounded-[18px] border border-white/10 bg-white/5 p-4">
                <Icon size={20} weight="bold" className="text-[#79e0a0]" />
                <div className="mt-2 font-head text-sm font-bold text-white">{title}</div>
                <p className="mt-1 text-xs text-[#a9b1ac]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Recently viewed + waitlist ===== */}
      <section className="bg-surface py-10">
        <div className="shell">
          <div className="eyebrow">A taste of what&apos;s coming</div>
          <h2 className="sec mb-5">Preview the drops</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            {RECENTLY_VIEWED.map((p, i) => (
              <ProductCard key={`${p.id}-${i}`} product={p} showRrp={false} />
            ))}
          </div>
          <div className="mt-10 rounded-[26px] border border-line bg-white p-8 text-center">
            <h2 className="sec">Never miss a drop.</h2>
            <p className="muted mx-auto mt-2 max-w-md">
              Get alerts when new listings land in your favourite brands and sizes.
            </p>
            <div className="mt-5 flex justify-center">
              <WaitlistForm />
            </div>
          </div>
        </div>
      </section>

      <MobileBottomBar />
      <div className="h-16 md:hidden" aria-hidden="true" />
    </main>
  );
}
