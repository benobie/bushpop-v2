// Programmatic brand size-chart page — Stage 1A.
// Pure RSC, statically exported (one HTML file per brand at
// /guides/size-charts/<slug>/index.html via generateStaticParams + trailingSlash).
//
// AIO-optimised: a 134-167 word answer block, AU/US/UK/EU table where official,
// brand-specific fit notes, and Article + BreadcrumbList + FAQPage JSON-LD.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRANDS, getBrand, type Brand } from "@/lib/brands";

const SITE = "https://bushpop.com.au";

export const dynamicParams = false;

export function generateStaticParams() {
  return BRANDS.map((b) => ({ brand: b.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brand: string }>;
}): Promise<Metadata> {
  const { brand: slug } = await params;
  const brand = getBrand(slug);
  if (!brand) return {};

  const title = `${brand.name} Size Chart — Australian Sizing & Conversions`;
  const description = `${brand.name} size chart for Australia: bust, waist and hip measurements${brand.intl ? ", AU/US/UK/EU conversions" : ""} and brand-specific fit notes for buying ${brand.name} secondhand.`;
  const url = `${SITE}/guides/size-charts/${brand.slug}/`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "article",
      url,
    },
  };
}

function buildJsonLd(brand: Brand) {
  const url = `${SITE}/guides/size-charts/${brand.slug}/`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `${brand.name} Size Chart — Australian Sizing & Conversions`,
      description: brand.answer.slice(0, 250),
      datePublished: "2026-06-17",
      dateModified: "2026-06-17",
      author: { "@type": "Organization", name: "Bushpop" },
      publisher: { "@type": "Organization", name: "Bushpop" },
      mainEntityOfPage: url,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Guides", item: `${SITE}/guides/` },
        { "@type": "ListItem", position: 2, name: "Size Charts", item: `${SITE}/guides/size-charts/` },
        { "@type": "ListItem", position: 3, name: brand.name, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: brand.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
}

export default async function BrandSizeChartPage({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand: slug } = await params;
  const brand = getBrand(slug);
  if (!brand) notFound();

  const jsonLd = buildJsonLd(brand);
  const siblings = BRANDS.filter((b) => b.slug !== brand.slug).slice(0, 4);

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-6 py-10">
      {jsonLd.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}

      <nav className="text-sm text-ink-3 mb-6" aria-label="Breadcrumb">
        <Link href="/guides/size-charts/" className="text-green-ink font-medium underline">
          Size Charts
        </Link>
        <span> / {brand.name}</span>
      </nav>

      <h1 className="font-head text-4xl font-extrabold tracking-tight mb-2">{brand.name} Size Chart</h1>
      <p className="text-sm text-ink-3 mb-6">{brand.category}</p>

      {/* AIO answer block — the citation magnet */}
      <p className="text-lg leading-relaxed mb-8">{brand.answer}</p>

      <p className="text-sm text-ink-2 mb-6">{brand.unitNote}</p>

      <h2 className="font-head text-2xl font-bold mb-4">{brand.name} body measurements</h2>
      <div className="overflow-x-auto mb-8">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-line-2">
              <th className="py-2 pr-4">Size</th>
              {brand.hasLetters && <th className="py-2 pr-4">Letter</th>}
              <th className="py-2 pr-4">Bust (cm)</th>
              <th className="py-2 pr-4">Waist (cm)</th>
              <th className="py-2 pr-4">Hip (cm)</th>
            </tr>
          </thead>
          <tbody>
            {brand.sizeRows.map((r) => (
              <tr key={r.size} className="border-b border-line">
                <td className="py-2 pr-4 font-medium">{r.size}</td>
                {brand.hasLetters && <td className="py-2 pr-4">{r.letter ?? "—"}</td>}
                <td className="py-2 pr-4">{r.bust}</td>
                <td className="py-2 pr-4">{r.waist}</td>
                <td className="py-2 pr-4">{r.hip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {brand.cmConverted && (
        <p className="text-xs text-ink-3 mb-8">
          Note: {brand.name} publishes its size chart in inches. The centimetre
          values above are converted from {brand.name}&apos;s official figures.
        </p>
      )}

      {brand.intl && (
        <>
          <h2 className="font-head text-2xl font-bold mb-4">
            {brand.name} international size conversion
          </h2>
          <div className="overflow-x-auto mb-8">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-line-2">
                  <th className="py-2 pr-4">AU</th>
                  <th className="py-2 pr-4">US</th>
                  <th className="py-2 pr-4">UK</th>
                  <th className="py-2 pr-4">EU</th>
                </tr>
              </thead>
              <tbody>
                {brand.intl.map((r) => (
                  <tr key={r.au} className="border-b border-line">
                    <td className="py-2 pr-4 font-medium">{r.au}</td>
                    <td className="py-2 pr-4">{r.us}</td>
                    <td className="py-2 pr-4">{r.uk}</td>
                    <td className="py-2 pr-4">{r.eu}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="font-head text-2xl font-bold mb-4">How {brand.name} fits</h2>
      <p className="text-lg leading-relaxed mb-8">{brand.fitNote}</p>

      <h2 className="font-head text-2xl font-bold mb-4">
        {brand.name} sizing — frequently asked questions
      </h2>
      <div className="mb-8 space-y-6">
        {brand.faqs.map((f) => (
          <div key={f.q}>
            <h3 className="font-head text-lg font-bold mb-1">{f.q}</h3>
            <p className="leading-relaxed">{f.a}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[18px] bg-surface p-6 mb-8">
        <p className="text-lg font-medium mb-2">
          Found your size? Shop {brand.name} secondhand on Bushpop.
        </p>
        <Link href="/shop/" className="text-green-ink font-medium underline">
          Browse the shop →
        </Link>
      </div>

      <p className="text-xs text-ink-3 mb-8">
        Last verified: {brand.lastVerified}. Source
        {brand.sources.length > 1 ? "s" : ""}:{" "}
        {brand.sources.map((s, i) => (
          <span key={s}>
            {i > 0 && ", "}
            <a href={s} rel="nofollow noopener" className="underline">
              {new URL(s).hostname.replace("www.", "")}
            </a>
          </span>
        ))}
        .
      </p>

      <section className="border-t border-line pt-6">
        <h2 className="font-head text-xl font-bold mb-3">Other brand size charts</h2>
        <ul className="space-y-1">
          {siblings.map((b) => (
            <li key={b.slug}>
              <Link
                href={`/guides/size-charts/${b.slug}/`}
                className="text-green-ink font-medium underline"
              >
                {b.name} size chart
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
