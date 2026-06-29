// Article JSON-LD for content/guide pages (mirrors the brand size-chart page
// pattern). Breadcrumb JSON-LD is emitted separately by <Breadcrumbs>.
import { SITE } from "./breadcrumbs";

export function ArticleJsonLd({
  headline,
  description,
  path,
  datePublished = "2026-06-17",
  dateModified = "2026-06-29",
}: {
  headline: string;
  description: string;
  path: string;
  datePublished?: string;
  dateModified?: string;
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    datePublished,
    dateModified,
    author: { "@type": "Organization", name: "Bushpop" },
    publisher: { "@type": "Organization", name: "Bushpop" },
    mainEntityOfPage: `${SITE}${path}`,
  };
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
