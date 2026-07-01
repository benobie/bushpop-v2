// Homepage — the approved prototype (bushpop-home-v2.html) ported to RSC, with
// "coming-soon" framing: demo products are illustrative and every marketplace
// action routes to the "Launching soon" storefront (see @/lib/links). Only the
// Fresh-drops filter, product hearts and waitlist form hydrate as client islands.
import Image from "next/image";
import Link from "next/link";
import {
  Search,
  Shield,
  Lock,
  BadgeCheck,
  MapPin,
  Zap,
  Tag,
  Package,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { ProductCard } from "@/components/product-card";
import { FreshDrops } from "@/components/fresh-drops";
import { WaitlistForm } from "@/components/waitlist-form";
import { MobileBottomBar } from "@/components/mobile-bottom-bar";
import { BRANDS, RECENTLY_VIEWED, STYLES } from "@/lib/demo-products";
import { COMING_SOON, SELL_SOON } from "@/lib/links";

const MARQUEE_POOL = [
  "/demo/tnf-puffer.jpg", "/demo/puffer-model.jpg", "/demo/salomon.jpg", "/demo/gazelle.jpg",
  "/demo/nike-tn.jpg", "/demo/birkenstock.jpg", "/demo/vint1.jpg", "/demo/vint2.jpg",
  "/demo/vint3.jpg", "/demo/vint4.jpg", "/demo/salomon2.jpg", "/demo/tnf-puffer2.jpg",
];

const QUICK_PATHS = ["Women", "Men", "Vintage", "Streetwear", "Outdoors", "Designer", "Sneakers", "Under $50"];
const HERO_CHIPS = ["Women", "Men", "Vintage", "Streetwear", "Sneakers", "Under $50"];

const TRUST = [
  { Icon: Shield, label: "Buyer protection" },
  { Icon: Lock, label: "Secure checkout" },
  { Icon: BadgeCheck, label: "Free authentication" },
  { Icon: MapPin, label: "Australian support" },
];

const SELLER_BENEFITS = [
  { Icon: Zap, title: "List in 60 seconds", body: "Snap, price, publish. Our tools do the fiddly bits." },
  { Icon: Tag, title: "No storefront fees", body: "Open a store and list for free. Keep more of every sale." },
  { Icon: Lock, title: "Paid securely", body: "Funds are protected and released once the buyer's happy." },
  { Icon: Package, title: "We print the label", body: "Prepaid, tracked postage — just pack and drop off." },
];

const SELLERS = [
  { name: "Marlowe Vintage", handle: "@marlowe", rating: 5.0, sold: 240, ships: 1, thumbs: ["/demo/vint1.jpg", "/demo/vint2.jpg", "/demo/vint3.jpg", "/demo/vint4.jpg"] },
  { name: "Northside Threads", handle: "@northside", rating: 4.9, sold: 512, ships: 2, thumbs: ["/demo/tnf-puffer.jpg", "/demo/puffer-model.jpg", "/demo/tnf-puffer2.jpg", "/demo/puffer-model2.jpg"] },
  { name: "Sole Society", handle: "@solesociety", rating: 4.9, sold: 388, ships: 1, thumbs: ["/demo/salomon.jpg", "/demo/gazelle.jpg", "/demo/nike-tn.jpg", "/demo/salomon2.jpg"] },
  { name: "The Reset Room", handle: "@resetroom", rating: 4.8, sold: 176, ships: 2, thumbs: ["/demo/vint4.jpg", "/demo/birkenstock.jpg", "/demo/gloves.jpg", "/demo/vint2.jpg"] },
];

const REVIEWS = [
  { quote: "Found a grail Carhartt jacket for a third of retail. Arrived spotless.", name: "Aisha K.", tag: "verified buyer", init: "A", bg: "#d9ede2" },
  { quote: "Sold my whole winter wardrobe in a week. The label printing is genius.", name: "Tom R.", tag: "seller", init: "T", bg: "#e5e0f2" },
  { quote: "Everything is authenticated, so I actually trust the designer listings.", name: "Priya M.", tag: "verified buyer", init: "P", bg: "#f2e6d9" },
  { quote: "Aussie sellers, quick postage, no customs nonsense. My new default.", name: "Jack D.", tag: "verified buyer", init: "J", bg: "#dbe8f0" },
];

const STATS = [
  { n: "1,600+", l: "pieces listed" },
  { n: "4,800+", l: "members" },
  { n: "1–2 days", l: "avg dispatch" },
  { n: "100%", l: "Aussie sellers" },
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
              Bring <span className="text-green-ink">joy</span> to your wardrobe
            </h1>
            <p className="muted mx-auto mt-4 max-w-lg text-[17px]">
              Vintage, streetwear &amp; designer — pre-loved, from sellers right across Australia.
            </p>
            <Link href={COMING_SOON} className="search mx-auto mt-6 !max-w-md" aria-label="Search preloved (launching soon)">
              <Search size={16} strokeWidth={2} />
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
          </div>
        </div>
      </section>

      {/* ===== Trust microbar ===== */}
      <section className="border-b border-line bg-white">
        <div className="shell flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-4 text-sm text-ink-2">
          {TRUST.map(({ Icon, label }) => (
            <span key={label} className="inline-flex items-center gap-2">
              <Icon size={16} strokeWidth={2} className="text-green-ink" />
              {label}
            </span>
          ))}
          <span className="hidden items-center gap-2 text-ink-3 md:inline-flex">
            <span className="h-4 w-px bg-line-2" />
            {["Afterpay", "Zip", "PayPal", "VISA"].map((p) => (
              <span key={p} className="rounded-md border border-line-2 px-2 py-0.5 text-[11px] font-medium">{p}</span>
            ))}
          </span>
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
          <Link href={COMING_SOON} className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-ink">
            See everything <ArrowRight size={15} strokeWidth={2.4} />
          </Link>
        </div>
        <FreshDrops />
        <p className="mt-4 text-xs text-ink-3">Illustrative preview — live listings arrive at launch.</p>
      </section>

      {/* ===== Shop by brand ===== */}
      <section className="bg-surface py-10">
        <div className="shell">
          <div className="eyebrow">Brands Australia loves</div>
          <h2 className="sec mb-5">Shop by brand</h2>
          <div className="flex flex-wrap gap-2">
            <Chip href={COMING_SOON} deal>Up to 80% off</Chip>
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

      {/* ===== Top-rated sellers ===== */}
      <section className="bg-surface py-10">
        <div className="shell">
          <div className="eyebrow">Real Aussie sellers</div>
          <h2 className="sec mb-5">Top-rated storefronts</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SELLERS.map((s) => (
              <div key={s.handle} className="rounded-[18px] border border-line bg-white p-3">
                <div className="grid grid-cols-2 gap-1.5">
                  {s.thumbs.map((t, i) => (
                    <div key={`${s.handle}-${i}`} className="aspect-square overflow-hidden rounded-lg bg-[#eceef0]">
                      <Image src={t} alt="" width={120} height={120} className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="font-head text-sm font-bold">{s.name}</span>
                  <BadgeCheck size={15} className="text-green-ink" />
                </div>
                <div className="text-xs text-ink-2">{s.handle}</div>
                <div className="mt-1 text-xs text-green-ink">★ {s.rating.toFixed(1)} · {s.sold} sold · ships in {s.ships} day{s.ships > 1 ? "s" : ""}</div>
                <Button href={COMING_SOON} variant="ghost" className="mt-3 !w-full" block>Follow</Button>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <Button href={SELL_SOON} variant="dark" size="lg">Open a store &amp; trade</Button>
          </div>
        </div>
      </section>

      {/* ===== Reviews + stats ===== */}
      <section className="shell py-12 text-center">
        <h2 className="sec">Loved by buyers and sellers</h2>
        <p className="muted mt-2">★★★★★ <strong>4.7 / 5</strong> from 1,248 buyers and sellers</p>
        <div className="mt-8 grid grid-cols-1 gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
          {REVIEWS.map((r) => (
            <figure key={r.name} className="rounded-[18px] border border-line bg-white p-5">
              <div className="text-green-ink">★★★★★</div>
              <blockquote className="mt-2 text-sm text-ink">{r.quote}</blockquote>
              <figcaption className="mt-4 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-full font-head text-sm font-bold text-ink" style={{ background: r.bg }}>{r.init}</span>
                <span>
                  <span className="block text-sm font-semibold">{r.name}</span>
                  <span className="block text-xs text-ink-3">{r.tag}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.l} className="rounded-[18px] bg-surface p-5">
              <div className="font-head text-2xl font-extrabold">{s.n}</div>
              <div className="text-xs text-ink-2">{s.l}</div>
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
              List in a minute, we handle the postage label, and you get paid securely. No storefront fees to start.
            </p>
            <Button href={SELL_SOON} variant="green" size="lg" className="mt-6">Start selling free</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {SELLER_BENEFITS.map(({ Icon, title, body }) => (
              <div key={title} className="rounded-[18px] border border-white/10 bg-white/5 p-4">
                <Icon size={20} className="text-[#79e0a0]" />
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
