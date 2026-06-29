// Static sitemap (generated at build under output:'export' → out/sitemap.xml).
// Includes only launch-ready, content-complete pages + the brand size-chart
// pages. TODO-scaffold and decision-pending pages (help, blog, terms/*,
// privacy, verification, giveaway-terms, zine, and the soon-redirected
// how-does-bushpop-work) are intentionally EXCLUDED so thin content stays out of
// the index until real copy lands. The /shop browse holding page is now a
// substantive 301 target (1,666 product URLs redirect to it) so it is included.
import type { MetadataRoute } from "next";
import { BRAND_SLUGS } from "@/lib/brands";

// Required under output:'export' so Next emits a static out/sitemap.xml.
export const dynamic = "force-static";

const SITE = "https://bushpop.com.au";
const LAST_MOD = "2026-06-29";

// Launch-ready content pages (trailing-slash canonical, matching trailingSlash:true).
const READY_PATHS: { path: string; priority: number }[] = [
  { path: "/", priority: 1.0 },
  { path: "/about/", priority: 0.7 },
  { path: "/about/how-it-works/", priority: 0.7 },
  { path: "/about/buying/", priority: 0.6 },
  { path: "/about/selling/", priority: 0.7 },
  { path: "/shop/", priority: 0.6 },
  { path: "/guides/size-charts/", priority: 0.9 },
  { path: "/guides/op-shops-sydney/", priority: 0.7 },
  { path: "/guides/op-shops-melbourne/", priority: 0.7 },
  { path: "/guides/vinted-australia/", priority: 0.6 },
  { path: "/selling/how-to-sell-on-bushpop-the-complete-guide/", priority: 0.6 },
  { path: "/whats-on/the-best-vintage-markets-to-visit-on-the-gold-coast/", priority: 0.5 },
  { path: "/contact/", priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const ready = READY_PATHS.map(({ path, priority }) => ({
    url: `${SITE}${path}`,
    lastModified: LAST_MOD,
    changeFrequency: "monthly" as const,
    priority,
  }));

  const brands = BRAND_SLUGS.map((slug) => ({
    url: `${SITE}/guides/size-charts/${slug}/`,
    lastModified: LAST_MOD,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [...ready, ...brands];
}
