// Pure RSC — no "use client".
// This page is the 301 redirect target for all /shop/:slug/ product URLs (1,666
// of them), the /source/* taxonomy and ~109 flat category archives. It serves as
// a browse-by-category holding page until the Launch 2 marketplace lands, so the
// 301 target stays substantive for both visitors and the SEO of the splat target.
//
// No live catalogue exists yet, so each department links to the most relevant
// Launch-1 guide or about page (fit guides, op-shop guides, how buying works)
// rather than to product listings.
import Link from "next/link";
import { ArrowRight, Clock } from "@phosphor-icons/react/dist/ssr";
import { pageMeta } from "@/lib/seo";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ArticleJsonLd } from "@/components/json-ld";
import { Button } from "@/components/button";
import { WaitlistForm } from "@/components/waitlist-form";

const TITLE = "Shop Secondhand Fashion in Australia";
const DESCRIPTION =
  "Browse secondhand clothing, shoes, bags and accessories on Bushpop, Australia's peer-to-peer preloved fashion marketplace. Free to list, with Buyer Protection on every order.";
const PATH = "/shop/";

export const metadata = pageMeta({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  type: "website",
});

// Departments curated from the WordPress taxonomy export (category-mapping.csv).
// `examples` are the real subcategories that lived under each department, kept as
// crawlable text so the redirect target carries the breadth of the old archives.
// `href` points at the most relevant existing Launch-1 page.
type Department = {
  name: string;
  examples: string;
  blurb: string;
  href: string;
  cta: string;
};

const DEPARTMENTS: Department[] = [
  {
    name: "Womenswear",
    examples:
      "Dresses, tops, crop tops, blouses, jeans, skirts, jackets, coats, knitwear and sets",
    blurb:
      "The biggest category on Bushpop. Preloved and vintage womenswear from real Australian wardrobes.",
    href: "/guides/size-charts/",
    cta: "Check the size charts before you buy",
  },
  {
    name: "Menswear",
    examples:
      "T-shirts, shirts, hoodies, jackets, jumpers, jeans, shorts and trousers",
    blurb:
      "Everyday basics through to vintage and designer menswear, sized for buying secondhand.",
    href: "/guides/size-charts/",
    cta: "Find your fit with the size charts",
  },
  {
    name: "Shoes & sneakers",
    examples:
      "Sneakers, boots, heels, sandals, slides, flats and loafers for women and men",
    blurb:
      "Preloved footwear across every style. Sizing varies a lot by brand, so check before you commit.",
    href: "/guides/size-charts/",
    cta: "Brand fit notes and size charts",
  },
  {
    name: "Bags",
    examples:
      "Handbags, shoulder bags, crossbody bags, totes, backpacks and clutches",
    blurb:
      "Everyday and statement bags, secondhand. Learn how buying works before you make an offer.",
    href: "/about/buying/",
    cta: "How buying on Bushpop works",
  },
  {
    name: "Jewellery & accessories",
    examples:
      "Necklaces, earrings, bracelets, rings, hats, sunglasses, scarves, belts and watches",
    blurb:
      "Finish the look with preloved jewellery and accessories from sellers around the country.",
    href: "/about/buying/",
    cta: "How buying on Bushpop works",
  },
  {
    name: "Swimwear",
    examples: "Bikinis, one pieces and beachwear",
    blurb:
      "Preloved swimwear for women and men. Measurements matter most here, so check the fit guide.",
    href: "/guides/size-charts/",
    cta: "Check the size charts",
  },
  {
    name: "Kids",
    examples: "Kids' clothing, sweatshirts and shoes",
    blurb:
      "Preloved kidswear that keeps good clothes in use as little ones grow out of them.",
    href: "/guides/size-charts/",
    cta: "Sizing help",
  },
  {
    name: "Vintage & collectables",
    examples: "Art, one-off pieces, sports and everything else",
    blurb:
      "The unexpected finds. While the marketplace is being rebuilt, our op-shop guides point you to the best preloved hunting in the meantime.",
    href: "/guides/op-shops-sydney/",
    cta: "Where to thrift right now",
  },
];

// Secondary helpers — the existing guides and about pages a secondhand shopper
// is most likely to want next.
const GUIDES: { label: string; href: string }[] = [
  {
    label: "Size charts for Australian and global brands",
    href: "/guides/size-charts/",
  },
  { label: "Best op shops in Sydney", href: "/guides/op-shops-sydney/" },
  { label: "Best op shops in Melbourne", href: "/guides/op-shops-melbourne/" },
  { label: "Vinted in Australia: what to know", href: "/guides/vinted-australia/" },
  { label: "How buying on Bushpop works", href: "/about/buying/" },
  { label: "Sell your clothes for free", href: "/about/selling/" },
];

export default function ShopPage() {
  return (
    <main className="shell py-10">
      <ArticleJsonLd headline={TITLE} description={DESCRIPTION} path={PATH} />
      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: "Shop", href: PATH },
        ]}
      />

      {/* Launching-soon hero */}
      <section className="rounded-[26px] border border-line bg-surface p-8 sm:p-10">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-green-bright">
          <Clock size={14} weight="bold" /> Launching soon
        </span>
        <h1 className="page mt-4">Shop secondhand fashion</h1>
        <p className="muted mt-3 max-w-2xl text-[17px]">
          Bushpop is Australia&apos;s peer-to-peer marketplace for preloved fashion —
          quality brands, vintage and one-off pieces at a fraction of retail, straight
          from real Australian wardrobes. The storefront is being built now.
        </p>
        <p className="muted mt-3 max-w-2xl">
          Listing will be free for sellers, and buyers get Buyer Protection on every
          order that holds payment securely until it arrives as described. Want to know
          the moment the first drops land?
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <WaitlistForm cta="Notify me" />
          <Button href="/about/selling/" variant="ghost">Learn how selling works</Button>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="sec mb-2">Browse by category</h2>
        <p className="muted mb-6 max-w-2xl">
          The full catalogue arrives with the marketplace relaunch. In the meantime,
          here is what Bushpop stocks, with a guide to help you shop each category
          secondhand.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {DEPARTMENTS.map((d) => (
            <li
              key={d.name}
              className="rounded-[18px] border border-line bg-white p-5 transition-colors hover:border-line-2"
            >
              <h3 className="font-head text-lg font-bold">{d.name}</h3>
              <p className="mt-1 text-sm text-ink-3">{d.examples}</p>
              <p className="mt-2 text-ink-2">{d.blurb}</p>
              <Link
                href={d.href}
                className="mt-3 inline-flex items-center gap-1.5 font-semibold text-green-bright"
              >
                {d.cta} <ArrowRight size={15} weight="bold" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="sec mb-4">Guides to shop secondhand</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {GUIDES.map((g) => (
            <li key={g.href}>
              <Link
                href={g.href}
                className="inline-flex items-center gap-1.5 font-medium text-green-bright"
              >
                {g.label} <ArrowRight size={14} weight="bold" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 rounded-[18px] bg-surface p-6">
        <h2 className="sec mb-2">Want to sell instead?</h2>
        <p className="muted mb-4 max-w-2xl">
          Turn the clothes you no longer wear into cash. Listing on Bushpop is free,
          your buyers are local, and you post sold items straight to them.
        </p>
        <Button href="/about/selling/" variant="dark">Learn how selling works</Button>
      </section>
    </main>
  );
}
