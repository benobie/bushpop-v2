// Brand size-chart data — Stage 1A programmatic SEO.
//
// One typed record per brand drives the dynamic route at
// /guides/size-charts/[brand]/. Adding a brand = adding an object here.
//
// ACCURACY CONTRACT (load-bearing): every `sizeRows` table is sourced from the
// brand's official published chart (see `sources`). Where the brand publishes in
// inches, `cmConverted: true` marks that the cm values are arithmetic conversions
// (×2.54) of the official inch figures, not brand-published cm — the page renders
// a transparency note in that case. Do NOT add a brand without a verifiable
// source; skip it instead. `verified` reflects confidence the numbers match the
// brand's actual official chart.

export interface SizeRow {
  /** The brand's own size label, e.g. "8", "M", "XS". */
  size: string;
  /** Optional letter mapping when the brand uses numeric primary labels. */
  letter?: string;
  /** Bust/chest in cm (range or single value). */
  bust: string;
  /** Natural waist in cm. */
  waist: string;
  /** Hip in cm. */
  hip: string;
}

export interface IntlRow {
  au: string;
  us: string;
  uk: string;
  eu: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface Brand {
  slug: string;
  name: string;
  /** Short category label shown in the hero + breadcrumb. */
  category: string;
  /** One-line note on the brand's label/unit system, rendered above the table. */
  unitNote: string;
  /** AIO answer block — 134-167 words, brand-specific, factual. The citation magnet. */
  answer: string;
  sizeRows: SizeRow[];
  /** Whether the size table has a letter-mapping column. */
  hasLetters: boolean;
  /** Official international conversion, only where the brand publishes one. */
  intl?: IntlRow[];
  /** Brand-specific fit guidance, 100+ chars, sourced. */
  fitNote: string;
  faqs: Faq[];
  verified: "high" | "medium";
  /** cm values are conversions of an official inch chart (renders a note). */
  cmConverted: boolean;
  sources: string[];
  /** Month + year the chart was last verified against source. */
  lastVerified: string;
}

export const BRANDS: Brand[] = [
  {
    slug: "gorman",
    name: "Gorman",
    category: "Australian fashion · women's",
    unitNote:
      "Gorman uses AU numeric sizing (6–20) with a letter mapping. Its chart is published in centimetres.",
    answer:
      "Gorman is an Australian brand using AU numeric sizing from 6 to 20, with a letter mapping where a 10 is Small, 12 is Medium and 14 is Large. The chart is published in centimetres: a size 12 fits a 97cm bust, 78cm waist and 104cm hip. The single most useful thing to know about Gorman sizing is that it runs notably generous. Tops, dresses and shirting commonly fit one to two AU sizes large, so a tagged 10 often wears closer to a 14, and many buyers size down accordingly. The clear exception is Gorman denim and straight-leg jeans, which fit true to size. Gorman publishes full international conversions (AU 10 = US 6 = UK 10 = EU 38). Because Gorman is a frequent secondhand find in Australia and pieces are rarely altered, the original size tag is reliable — just factor in the generous cut when choosing.",
    sizeRows: [
      { size: "6", letter: "2XS", bust: "82", waist: "63", hip: "89" },
      { size: "8", letter: "XS", bust: "87", waist: "68", hip: "94" },
      { size: "10", letter: "S", bust: "92", waist: "73", hip: "99" },
      { size: "12", letter: "M", bust: "97", waist: "78", hip: "104" },
      { size: "14", letter: "L", bust: "102", waist: "83", hip: "109" },
      { size: "16", letter: "XL", bust: "107", waist: "88", hip: "114" },
    ],
    hasLetters: true,
    intl: [
      { au: "6", us: "2", uk: "6", eu: "34" },
      { au: "8", us: "4", uk: "8", eu: "36" },
      { au: "10", us: "6", uk: "10", eu: "38" },
      { au: "12", us: "8", uk: "12", eu: "40" },
      { au: "14", us: "10", uk: "14", eu: "42" },
      { au: "16", us: "12", uk: "16", eu: "44" },
    ],
    fitNote:
      "Gorman runs notably generous — tops, dresses and shirting often fit one to two AU sizes large, so many buyers size down. The exception is Gorman denim and straight-leg jeans, which fit true to size.",
    faqs: [
      {
        q: "Does Gorman run big or small?",
        a: "Gorman runs generous across most categories. Tops, dresses and shirting commonly fit one to two AU sizes larger than the tag, so a tagged size 10 often wears closer to a 14. Many buyers size down. The main exception is Gorman denim and straight-leg jeans, which fit true to the published size chart.",
      },
      {
        q: "What is a Gorman size 12 in cm?",
        a: "A Gorman size 12 (Medium) corresponds to a 97cm bust, 78cm waist and 104cm hip on the brand's official centimetre chart. Remember the cut runs generous, so if you measure at the top of a size band you may prefer the size below.",
      },
      {
        q: "Is buying Gorman secondhand reliable for sizing?",
        a: "Yes. Gorman pieces are rarely altered, so the original AU size tag is dependable. Use the centimetre chart above, then factor in the brand's generous cut — measuring a garment flat against these figures is the safest check when buying preloved.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://gormanshop.co.nz/pages/size-guide"],
    lastVerified: "June 2026",
  },
  {
    slug: "country-road",
    name: "Country Road",
    category: "Australian fashion · women's",
    unitNote:
      "Country Road uses AU numeric sizing (4–16) as its primary system, with a letter mapping. Its chart is centimetre-native.",
    answer:
      "Country Road is an Australian brand using AU numeric sizing from 4 to 16, with a letter mapping where 8 is XS, 10 is Small, 12 is Medium and 14 is Large. The chart is centimetre-native and accurate: a size 10 fits a 90cm bust, 73.5cm waist and 99cm hip. Most Country Road clothing fits true to its published chart, which makes it one of the more predictable Australian brands to buy unseen. The main exception is the Heritage sweats and relaxed knitwear lines, which are designed to run large and baggy — take your usual size and expect a relaxed drape rather than a fitted one. Country Road uses AU numeric as its primary system and offers a True Fit recommendation tool instead of a printed international grid. When buying Country Road secondhand, the size tag is dependable for tailored pieces; only the relaxed lines need a mental adjustment.",
    sizeRows: [
      { size: "4", letter: "XXXS", bust: "77.5", waist: "61", hip: "86.5" },
      { size: "6", letter: "XXS", bust: "80", waist: "63.5", hip: "89" },
      { size: "8", letter: "XS", bust: "85", waist: "68.5", hip: "94" },
      { size: "10", letter: "S", bust: "90", waist: "73.5", hip: "99" },
      { size: "12", letter: "M", bust: "95", waist: "78.5", hip: "104" },
      { size: "14", letter: "L", bust: "100", waist: "83.5", hip: "109" },
      { size: "16", letter: "XL", bust: "105", waist: "88.5", hip: "114" },
    ],
    hasLetters: true,
    fitNote:
      "Country Road generally fits true to its centimetre-accurate chart, making it predictable to buy unseen. The exception is the Heritage sweats and relaxed knitwear, which run large and baggy by design.",
    faqs: [
      {
        q: "Does Country Road fit true to size?",
        a: "Yes — Country Road is one of the more predictable Australian brands, fitting true to its centimetre-native size chart for tailored and structured pieces. The exception is the Heritage sweats and relaxed knitwear lines, which are designed to run large and baggy, so expect a relaxed drape on those.",
      },
      {
        q: "What is a Country Road size 10 in cm?",
        a: "A Country Road size 10 (Small) fits a 90cm bust, 73.5cm waist and 99cm hip on the brand's official centimetre chart.",
      },
      {
        q: "Does Country Road publish a UK or EU conversion?",
        a: "Country Road uses AU numeric sizing as its primary system and offers an online True Fit recommendation tool rather than a printed AU/US/UK/EU grid. Measuring against the centimetre figures above is the most reliable way to convert.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: [
      "https://www.naturalnecessity.com.au/pages/size-guide-country-road-womens-apparel",
    ],
    lastVerified: "June 2026",
  },
  {
    slug: "lululemon",
    name: "Lululemon",
    category: "Activewear · women's",
    unitNote:
      "Lululemon uses numeric sizing (0–14+) with a letter mapping. The brand publishes in inches; centimetres below are converted.",
    answer:
      "Lululemon uses a numeric sizing system from 0 to 20, with an accompanying letter mapping where a 6 is Small, 8 is Medium, and 10 is Large. A size 8 corresponds to roughly a 91.5cm bust, 73.5cm waist, and 99cm hip. Lululemon's pieces are engineered for a close, supportive fit, so even when a garment matches the size chart it can feel smaller than you expect. The key fit rule is category-dependent: Align leggings run true to size and feel forgiving, while Wunder Train leggings and every sports bra run small — most people size up in those. Lululemon publishes its chart in inches rather than centimetres, and fit can shift slightly when fabrics are updated season to season. Buying Lululemon secondhand is popular because the construction lasts; just confirm the exact style name in the listing, since fit varies more by style than by size.",
    sizeRows: [
      { size: "0", bust: "73.5", waist: "53.5", hip: "81.5" },
      { size: "2", letter: "XXS", bust: "76", waist: "58.5", hip: "84" },
      { size: "4", letter: "XS", bust: "81.5", waist: "63.5", hip: "89" },
      { size: "6", letter: "S", bust: "86.5", waist: "68.5", hip: "94" },
      { size: "8", letter: "M", bust: "91.5", waist: "73.5", hip: "99" },
      { size: "10", letter: "L", bust: "96.5", waist: "78.5", hip: "104" },
      { size: "12", letter: "XL", bust: "101.5", waist: "84", hip: "109" },
      { size: "14", letter: "XXL", bust: "106.5", waist: "89", hip: "114.5" },
    ],
    hasLetters: true,
    fitNote:
      "Lululemon generally matches its chart but is engineered for a close, compressive fit, so it feels small. Align leggings run true to size; Wunder Train leggings and all sports bras run small — size up.",
    faqs: [
      {
        q: "Does Lululemon run small?",
        a: "Lululemon broadly matches its size chart, but garments are engineered for a close, supportive fit, so they feel smaller than expected. It is category-dependent: Align leggings run true to size and feel forgiving, while Wunder Train leggings and every sports bra run small, so most people size up in those.",
      },
      {
        q: "What is a Lululemon size 8?",
        a: "A Lululemon size 8 maps to Medium and corresponds to roughly a 91.5cm bust, 73.5cm waist and 99cm hip. These centimetre figures are converted from Lululemon's official inch chart, as the brand does not publish centimetres.",
      },
      {
        q: "Why does Lululemon sizing vary between styles?",
        a: "Lululemon fit varies more by style than by size, and fabrics are occasionally updated season to season. When buying secondhand, confirm the exact style name (e.g. Align vs Wunder Train) in the listing rather than relying on the numeric size alone.",
      },
    ],
    verified: "high",
    cmConverted: true,
    sources: [
      "https://shop.lululemon.com/help/size-guide/womens",
      "https://apparel.onepeloton.com/pages/lululemon-size-guide",
    ],
    lastVerified: "June 2026",
  },
  {
    slug: "nike",
    name: "Nike",
    category: "Activewear · women's",
    unitNote:
      "Nike uses alpha sizing (XS–2XL) mapped to US numeric. The brand publishes in inches; centimetres below are converted.",
    answer:
      "Nike women's apparel is built around an alpha sizing system (XS to 2XL) that maps to standard US numeric sizes, with body measurements published as ranges. A women's size Medium fits a bust of roughly 90–96.5cm, a natural waist of 73.5–80cm, and hips of 98–104cm. The most important thing to know about Nike sizing is that the brand labels every garment with a specific fit — Standard, Slim, Loose, or Oversized — in the product's Size & Fit panel. Standard-fit pieces run true to size, Slim and compression Dri-FIT styles fit snug, and Loose or Oversized cuts run large, so consider sizing down on those. Because Nike sells globally, the Australian site shows the same body measurements with AU garment labels. When buying Nike secondhand, always check the listed garment-fit type alongside the size tag, since two same-size items can fit very differently.",
    sizeRows: [
      { size: "XS", bust: "75–82.5", waist: "60–66", hip: "84–85" },
      { size: "S", bust: "82.5–90", waist: "66–73.5", hip: "90–98" },
      { size: "M", bust: "90–96.5", waist: "73.5–80", hip: "98–104" },
      { size: "L", bust: "96.5–104", waist: "80–87.5", hip: "104–112" },
      { size: "XL", bust: "104–113", waist: "87.5–98", hip: "112–119" },
      { size: "2XL", bust: "113–123", waist: "98–108", hip: "119–127" },
    ],
    hasLetters: false,
    fitNote:
      "Nike apparel runs true to size in its Standard fit, but every garment is labelled Standard, Slim, Loose or Oversized. Slim and compression Dri-FIT styles fit snug; Loose and Oversized cuts run large — size down on those.",
    faqs: [
      {
        q: "Does Nike clothing run true to size?",
        a: "Nike apparel runs true to size in its Standard fit, but the brand labels every garment Standard, Slim, Loose or Oversized in the Size & Fit panel. Slim and compression Dri-FIT pieces fit snug, while Loose and Oversized cuts run large, so size down on those. Always check the fit type, not just the size.",
      },
      {
        q: "What is a Nike women's Medium in cm?",
        a: "A Nike women's Medium fits a bust of roughly 90–96.5cm, a waist of 73.5–80cm and hips of 98–104cm. These centimetre ranges are converted from Nike's official inch chart.",
      },
      {
        q: "How should I check sizing when buying Nike secondhand?",
        a: "Check the garment-fit type (Standard, Slim, Loose or Oversized) alongside the size tag, since two items with the same size can fit very differently. If the listing doesn't state it, measuring the garment flat against the chart above is the safest check.",
      },
    ],
    verified: "medium",
    cmConverted: true,
    sources: [
      "https://www.nike.com/size-fit/womens-tops-alpha",
      "https://nwslshop.com/pages/womens-nike-size-chart",
    ],
    lastVerified: "June 2026",
  },
  {
    slug: "adidas",
    name: "Adidas",
    category: "Activewear · women's",
    unitNote:
      "Adidas uses alpha sizing (XS–XL) with numeric equivalents. The brand publishes in inches; centimetres below are converted.",
    answer:
      "Adidas women's apparel uses alpha sizing (XS to XL) with numeric equivalents, where Small covers US 4–6 and Medium covers US 8–10. A women's Medium fits a bust of about 89–94cm, a waist of 73.5–78.5cm, and hips of 98–103cm. Adidas performance and activewear generally runs true to size, particularly tops, though compression and synthetic pieces fit tighter than cotton basics. The main thing to watch is the Originals range: unisex tracksuits, windbreakers and oversized streetwear cuts run large, especially on petite frames, so sizing down is common there. Adidas also has slight differences between its EU and US women's cuts. The brand publishes measurements in inches, so centimetre figures are converted. When shopping Adidas secondhand, distinguish between fitted Performance training gear and relaxed Originals lifestyle pieces, because the same labelled size behaves very differently between those two lines.",
    sizeRows: [
      { size: "XS", letter: "0–2", bust: "76–81", waist: "61–66", hip: "85–90" },
      { size: "S", letter: "4–6", bust: "82.5–87.5", waist: "67.5–72.5", hip: "91.5–96.5" },
      { size: "M", letter: "8–10", bust: "89–94", waist: "73.5–78.5", hip: "98–103" },
      { size: "L", letter: "12–14", bust: "95.5–101.5", waist: "80–85", hip: "104–109" },
      { size: "XL", letter: "16–18", bust: "103–109", waist: "86.5–94", hip: "110.5–117" },
    ],
    hasLetters: true,
    fitNote:
      "Adidas Performance and activewear runs true to size, especially tops; compression pieces fit tighter. Originals tracksuits, windbreakers and oversized streetwear run large — size down, particularly on petite frames.",
    faqs: [
      {
        q: "Does Adidas run true to size?",
        a: "Adidas Performance and activewear generally runs true to size, particularly tops, though compression and synthetic pieces fit tighter than cotton basics. The Originals range is different — unisex tracksuits, windbreakers and oversized streetwear cuts run large, so sizing down is common, especially on petite frames.",
      },
      {
        q: "What is an Adidas women's Medium in cm?",
        a: "An Adidas women's Medium (US 8–10) fits a bust of about 89–94cm, a waist of 73.5–78.5cm and hips of 98–103cm. These centimetre ranges are converted from Adidas's official inch chart.",
      },
      {
        q: "Is Adidas sizing the same across all ranges?",
        a: "No. Fitted Performance training gear and relaxed Originals lifestyle pieces behave very differently at the same labelled size, and there are slight differences between EU and US women's cuts. When buying secondhand, identify which line the item is from before choosing a size.",
      },
    ],
    verified: "medium",
    cmConverted: true,
    sources: [
      "https://www.scheels.com/size-chart/adidas-womens-apparel-size-chart/",
      "https://www.adidas.com/us/help/size_charts/women-shirts_tops",
    ],
    lastVerified: "June 2026",
  },
];

export function getBrand(slug: string): Brand | undefined {
  return BRANDS.find((b) => b.slug === slug);
}

export const BRAND_SLUGS = BRANDS.map((b) => b.slug);
