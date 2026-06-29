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
import { pageMeta } from "@/lib/seo";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ArticleJsonLd } from "@/components/json-ld";

const TITLE = "Shop Secondhand Fashion in Australia";
const DESCRIPTION =
  "Browse secondhand clothing, shoes, bags and accessories on Bushpop, Australia's peer-to-peer preloved fashion marketplace. Free to sell, with Buyer Protection on every order.";
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
    <main className="mx-auto max-w-5xl px-4 py-10">
      <ArticleJsonLd headline={TITLE} description={DESCRIPTION} path={PATH} />
      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: "Shop", href: PATH },
        ]}
      />

      <h1 className="mb-4 text-4xl font-bold">Shop secondhand fashion</h1>

      <p className="mb-4 max-w-3xl text-lg text-gray-600">
        Bushpop is Australia's peer-to-peer marketplace for preloved fashion.
        Sellers list straight from their own wardrobes, so you find quality
        brands, vintage and one-off pieces at a fraction of retail, and good
        clothes stay out of landfill.
      </p>
      <p className="mb-10 max-w-3xl text-gray-600">
        Listing is completely free for sellers. Buyers pay a 7% Buyer Protection
        fee at checkout that holds your payment securely until your order arrives
        as described. There is no swapping and no separate verification step, just
        a simple, safe way to buy and sell secondhand. Questions? Email{" "}
        <a href="mailto:support@bushpop.com.au" className="text-blue-600 underline">
          support@bushpop.com.au
        </a>
        .
      </p>

      <section className="mb-12">
        <h2 className="mb-2 text-2xl font-semibold">Browse by category</h2>
        <p className="mb-6 max-w-3xl text-gray-600">
          The full catalogue arrives with the marketplace relaunch. In the
          meantime, here is what Bushpop stocks, with a guide to help you shop each
          category secondhand.
        </p>
        <ul className="grid gap-5 sm:grid-cols-2">
          {DEPARTMENTS.map((d) => (
            <li
              key={d.name}
              className="rounded-lg border border-gray-200 p-5 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              <h3 className="mb-1 text-xl font-semibold">{d.name}</h3>
              <p className="mb-2 text-sm text-gray-500">{d.examples}</p>
              <p className="mb-3 text-gray-600">{d.blurb}</p>
              <Link href={d.href} className="font-medium text-blue-600 underline">
                {d.cta}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold">Guides to shop secondhand</h2>
        <ul className="space-y-2">
          {GUIDES.map((g) => (
            <li key={g.href}>
              <Link href={g.href} className="text-blue-600 underline">
                {g.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg bg-gray-50 p-6">
        <h2 className="mb-2 text-2xl font-semibold">Want to sell instead?</h2>
        <p className="mb-3 max-w-3xl text-gray-600">
          Turn the clothes you no longer wear into cash. Listing on Bushpop is
          free, your buyers are local, and you post sold items straight to them.
        </p>
        <Link href="/about/selling/" className="font-medium text-blue-600 underline">
          Learn how selling works
        </Link>
      </section>
    </main>
  );
}
