/**
 * Curated brand list for the sell-flow typeahead (D15).
 *
 * Static config, not a DB table — sufficient at single-seller volume; the
 * MeiliSearch-backed brands table is a later build. Sourced from the real
 * catalogue (products-2026-06-16.csv, prototype BRANDS) merged with the 19
 * brands that have live size-chart guides on the content site.
 *
 * Sorted case-insensitively with "Other / Unbranded" pinned last. Keep it
 * that way — the AI draft prompt embeds this list and must stay byte-stable.
 */

export const BRANDS = [
  "adidas",
  "adidas Originals",
  "Alo Yoga",
  "ASICS",
  "ASOS",
  "Balenciaga",
  "Bardot",
  "Birkenstock",
  "Brandy Melville",
  "Carhartt",
  "Converse",
  "Cotton On",
  "Country Road",
  "Decjuba",
  "Dr Martens",
  "Forever New",
  "Gorman",
  "H&M",
  "HOKA",
  "Industrie",
  "KOOKAÏ",
  "Lacoste",
  "Lululemon",
  "New Balance",
  "Nike",
  "On",
  "Patagonia",
  "Princess Polly",
  "Ralph Lauren",
  "Salomon",
  "Seed Heritage",
  "SKIMS",
  "Sportsgirl",
  "The North Face",
  "Tommy Hilfiger",
  "Uniqlo",
  "Vans",
  "Witchery",
  "Zara",
  "Other / Unbranded",
] as const;

export type Brand = (typeof BRANDS)[number];

/**
 * Brands with a live size-chart guide at /guides/size-charts/{slug}/ on the
 * content site. Keys MUST be entries in BRANDS; slugs MUST match
 * `apps/web/src/lib/brands.ts` (a CI check ties the two together in the
 * Phase-2 wizard work). Only render the size-chart link for these.
 */
export const SIZE_CHART_BRAND_SLUGS: Partial<Record<Brand, string>> = {
  adidas: "adidas",
  ASOS: "asos",
  Bardot: "bardot",
  "Cotton On": "cotton-on",
  "Country Road": "country-road",
  Decjuba: "decjuba",
  "Forever New": "forever-new",
  Gorman: "gorman",
  "H&M": "hm",
  Lululemon: "lululemon",
  Nike: "nike",
  "Princess Polly": "princess-polly",
  "Ralph Lauren": "ralph-lauren",
  "Seed Heritage": "seed-heritage",
  Sportsgirl: "sportsgirl",
  "Tommy Hilfiger": "tommy-hilfiger",
  Uniqlo: "uniqlo",
  Witchery: "witchery",
  Zara: "zara",
};
