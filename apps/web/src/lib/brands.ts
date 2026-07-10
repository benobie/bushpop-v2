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
  {
    slug: "zara",
    name: "Zara",
    category: "Global fast fashion · women's",
    unitNote:
      "Zara labels womenswear with both an alpha size (XS–XL) and a European numeric size. Its body chart is centimetre-native.",
    answer:
      "Zara is a Spanish brand that labels womenswear with both an alpha size (XS to XL) and a European numeric size, and its body chart is published natively in centimetres. A size Medium fits roughly a 90cm bust, 70cm waist and 98cm hip, which lines up with an EU 38 or an Australian 12. The single most useful thing to know about Zara is that it runs small and cuts slim, especially through tops, shoulders and tailored jackets, so many shoppers size up one from their usual fit. Sizing is also inconsistent between ranges and seasons, because Zara produces collections on very short cycles. Australian sizing follows UK numbers, so an AU 10 maps to a Zara Small or EU 36. When buying Zara secondhand, measure the garment flat against the chart rather than trusting the tag, since the cut varies more than the label suggests.",
    sizeRows: [
      { size: "XXS", bust: "80", waist: "58", hip: "86" },
      { size: "XS", bust: "82", waist: "62", hip: "90" },
      { size: "S", bust: "86", waist: "66", hip: "94" },
      { size: "M", bust: "90", waist: "70", hip: "98" },
      { size: "L", bust: "96", waist: "76", hip: "104" },
      { size: "XL", bust: "102", waist: "82", hip: "110" },
      { size: "XXL", bust: "108", waist: "88", hip: "116" },
    ],
    hasLetters: false,
    intl: [
      { au: "6", us: "2", uk: "6", eu: "34" },
      { au: "8", us: "4", uk: "8", eu: "36" },
      { au: "10", us: "6", uk: "10", eu: "38" },
      { au: "12", us: "8", uk: "12", eu: "40" },
      { au: "14", us: "10", uk: "14", eu: "42" },
      { au: "16", us: "12", uk: "16", eu: "44" },
    ],
    fitNote:
      "Zara runs small and cuts slim, particularly through tops, shoulders and tailored jackets, so many shoppers size up one. Fit is also inconsistent between ranges and seasons because of the brand's short production cycles.",
    faqs: [
      {
        q: "Does Zara run small?",
        a: "Yes — Zara is widely reported to run small and cut slim relative to other high-street brands, especially in tops, shoulders and structured jackets, so sizing up one is common. Fit also varies noticeably between ranges and seasons, so the same labelled size can feel different across two Zara pieces.",
      },
      {
        q: "What is a Zara Medium in Australian sizes?",
        a: "A Zara Medium fits roughly a 90cm bust, 70cm waist and 98cm hip, which corresponds to an EU 38 and an Australian 12. Zara uses UK numbers for its numeric labels, and Australian women's sizing follows UK sizing, so an AU 10 maps to a Zara Small or EU 36.",
      },
      {
        q: "How do I check Zara sizing when buying secondhand?",
        a: "Measure the garment flat and compare it to the centimetre chart above rather than relying on the size tag, because Zara's cut varies more than the label implies. Pay particular attention to bust and shoulder width on fitted tops, where Zara runs tightest.",
      },
    ],
    verified: "medium",
    cmConverted: false,
    sources: [
      "https://www.sizedepo.com/sc/sizechart/zara-women-234",
      "https://size-charts.com/brands/zara-size-charts/zara-womens-size-chart/",
    ],
    lastVerified: "June 2026",
  },
  {
    slug: "hm",
    name: "H&M",
    category: "Global fast fashion · women's",
    unitNote:
      "H&M uses European numeric sizing as its base, mapped to alpha labels. The centimetre ranges below are H&M's own body measurements.",
    answer:
      "H&M is a Swedish brand that bases its womenswear on European numeric sizing, mapped to alpha labels from XXS to XL, with body measurements published in centimetres. A size Small spans roughly an 82–90cm bust, a 66–74cm waist and a 90–97.5cm hip, which maps to an EU 36–38 or an Australian 8–10. The key thing to know is that H&M's alpha size bands are unusually wide, so a single letter can cover an 8cm bust range and fit varies a lot within one size. Fit also differs by line: Basics tend to run slightly generous, while the Premium and tailored ranges sit closer to the body chart. Australian sizing follows UK numbers. Because H&M garment cuts are inconsistent across collections, the most reliable approach when buying secondhand is to measure the item flat and match it to these centimetre ranges rather than trusting the label alone.",
    sizeRows: [
      { size: "XXS", bust: "74–78", waist: "58–62", hip: "82–86" },
      { size: "XS", bust: "78–82", waist: "62–66", hip: "86–90" },
      { size: "S", bust: "82–90", waist: "66–74", hip: "90–97.5" },
      { size: "M", bust: "90–98", waist: "74–82.5", hip: "97.5–103.5" },
      { size: "L", bust: "98–107", waist: "82.5–93", hip: "103.5–110.5" },
      { size: "XL", bust: "107–119", waist: "93–105", hip: "110.5–120.5" },
    ],
    hasLetters: false,
    intl: [
      { au: "6", us: "2", uk: "6", eu: "32" },
      { au: "8", us: "4", uk: "8", eu: "34" },
      { au: "10", us: "6", uk: "10", eu: "36" },
      { au: "12", us: "8", uk: "12", eu: "38" },
      { au: "14", us: "10", uk: "14", eu: "40" },
      { au: "16", us: "12", uk: "16", eu: "42" },
    ],
    fitNote:
      "H&M's alpha size bands are unusually wide, so fit varies a lot within a single letter. Basics run slightly generous while Premium and tailored lines sit closer to the body chart — check each garment's own measurements.",
    faqs: [
      {
        q: "Why do H&M sizes feel inconsistent?",
        a: "H&M designs across several lines — Basics, Trend and Premium — and its alpha size bands are wide, so a Small can span an 82–90cm bust. The same labelled size genuinely fits differently between collections, which is why H&M lists individual measurements on each product page.",
      },
      {
        q: "What is an H&M EU 36 in Australian sizing?",
        a: "EU 36 maps to UK 10 and Australian 10 in H&M's conversion, sitting in the Small to Medium band with roughly an 84–90cm bust. H&M does not publish a separate Australian column, but Australian women's sizing follows UK numbers.",
      },
      {
        q: "Does H&M run small or large?",
        a: "It depends on the line. H&M Basics tend to run slightly generous for the stated measurement, while Premium and tailored pieces run true to the body chart. When buying secondhand, measure the garment flat against the centimetre ranges above rather than trusting the label.",
      },
    ],
    verified: "medium",
    cmConverted: false,
    sources: [
      "https://pitapats.com/pages/h-m-woman-size-chart",
      "https://sizechartly.com/hm-womens-size-chart/",
    ],
    lastVerified: "June 2026",
  },
  {
    slug: "uniqlo",
    name: "Uniqlo",
    category: "Global basics · women's",
    unitNote:
      "Uniqlo uses alpha sizing (XXS–XXL) with a US numeric mapping. The centimetre figures below are Uniqlo's published body measurements.",
    answer:
      "Uniqlo is a Japanese brand that sizes womenswear with alpha labels from XXS to XXL, alongside a US numeric mapping, and publishes body measurements in centimetres. A size Medium maps to US 8–10 and fits roughly an 89–94cm bust, a 71–74cm waist and a 96–102cm hip. The most important thing to know is that Uniqlo is drafted to Japanese body proportions and runs small by Western standards, so many shoppers size up one — a Western Medium often wears better as a Uniqlo Large, particularly in fitted tops and dresses. Outerwear and the relaxed LifeWear basics are more forgiving. Uniqlo revised its women's body chart from late 2025, so re-check the ranges if you sized from an older guide. Australian stores use the same alpha labels. When buying Uniqlo secondhand, go by the centimetre body measurements rather than converting from your usual AU dress size, since the alpha cut sits smaller than the number suggests.",
    sizeRows: [
      { size: "XXS", letter: "US 000–00", bust: "74–79", waist: "56–58", hip: "83–87" },
      { size: "XS", letter: "US 0–2", bust: "79–84", waist: "61–64", hip: "87–91" },
      { size: "S", letter: "US 4–6", bust: "84–89", waist: "66–69", hip: "91–96" },
      { size: "M", letter: "US 8–10", bust: "89–94", waist: "71–74", hip: "96–102" },
      { size: "L", letter: "US 12", bust: "94–99", waist: "76", hip: "102–108" },
      { size: "XL", letter: "US 14", bust: "99–104", waist: "81", hip: "108–114" },
      { size: "XXL", letter: "US 16", bust: "104–109", waist: "86", hip: "114–120" },
    ],
    hasLetters: true,
    fitNote:
      "Uniqlo is drafted to Japanese body proportions and runs small by Western standards, so many shoppers size up one — a Western Medium often fits better as a Uniqlo Large. Outerwear and relaxed LifeWear basics are more forgiving.",
    faqs: [
      {
        q: "Does Uniqlo run small?",
        a: "Yes. Uniqlo sizing is based on Japanese body proportions, which run smaller than Western averages, so most Western shoppers with a Medium body measurement find a Uniqlo Large or XL more comfortable, especially in fitted tops and dresses. Outerwear and relaxed basics are more forgiving.",
      },
      {
        q: "What is a Uniqlo Medium in centimetres?",
        a: "A Uniqlo Medium maps to US 8–10 and fits roughly an 89–94cm bust, 71–74cm waist and 96–102cm hip on the brand's body chart. Uniqlo revised its women's measurements from late 2025, so re-check against the current ranges if you sized from an older guide.",
      },
      {
        q: "How does Uniqlo sizing work in Australia?",
        a: "Uniqlo Australia uses the same alpha labels (XS, S, M, L, XL) as the rest of the world and does not publish an Australian numeric conversion. The most reliable approach is to match your body measurements to the centimetre ranges above rather than converting from your usual AU dress size.",
      },
    ],
    verified: "medium",
    cmConverted: false,
    sources: ["https://www.sizedepo.com/sc/sizechart/uniqlo-women-242"],
    lastVerified: "June 2026",
  },
  {
    slug: "witchery",
    name: "Witchery",
    category: "Australian fashion · women's",
    unitNote:
      "Witchery uses AU numeric sizing (4–20) with an XXS–XXXL letter mapping. Its chart is published in centimetres as ranges per size.",
    answer:
      "Witchery is an Australian brand using AU numeric sizing from 4 to 20, with a letter mapping where a 10 is Small, 12 is Medium and 14 is Large, and its chart is published in centimetres as ranges. A size 12 fits a 97–101cm bust, 77–81cm waist and 106–110cm hip. The useful thing to know about Witchery is that it sizes close to the standard Australian scale, so it is one of the more predictable AU brands to buy unseen — the tagged number generally matches the body it is drafted for. The exception is Witchery's relaxed and oversized styles, which the brand grades across two numeric sizes at once (a single label covering, say, AU 4 to 8), so those pieces wear larger and looser by design. Because Witchery is a common secondhand find and pieces are rarely altered, the size tag is dependable — just identify whether a piece is a tailored or a relaxed cut before choosing.",
    sizeRows: [
      { size: "6", letter: "XXS", bust: "82–86", waist: "62–66", hip: "91–95" },
      { size: "8", letter: "XS", bust: "87–91", waist: "67–71", hip: "96–100" },
      { size: "10", letter: "S", bust: "92–96", waist: "72–76", hip: "101–105" },
      { size: "12", letter: "M", bust: "97–101", waist: "77–81", hip: "106–110" },
      { size: "14", letter: "L", bust: "102–106", waist: "82–86", hip: "111–115" },
      { size: "16", letter: "XL", bust: "107–111", waist: "87–91", hip: "116–120" },
    ],
    hasLetters: true,
    fitNote:
      "Witchery sizes close to the standard Australian scale, making it predictable to buy unseen. The exception is its relaxed and oversized styles, which are graded across two numeric sizes at once and wear larger and looser by design.",
    faqs: [
      {
        q: "Does Witchery fit true to size?",
        a: "Largely yes — Witchery sizes close to the standard Australian scale, so the tagged number generally matches the body it is drafted for, making it one of the more predictable AU brands. The exception is its relaxed and oversized styles, which are graded across two numeric sizes and wear looser by design.",
      },
      {
        q: "What is a Witchery size 12 in cm?",
        a: "A Witchery size 12 (Medium) fits a 97–101cm bust, 77–81cm waist and 106–110cm hip on the brand's official centimetre chart. Witchery publishes ranges rather than single points, so if you fall at the top of a band the next size up may suit a tailored piece better.",
      },
      {
        q: "Is Witchery reliable to buy secondhand?",
        a: "Yes. Witchery pieces are rarely altered, so the original AU size tag is dependable. Identify whether a garment is a tailored or a relaxed/oversized cut first, then match the centimetre ranges above — measuring the item flat is the safest check when buying preloved.",
      },
    ],
    verified: "medium",
    cmConverted: false,
    sources: ["https://lodstore.com.au/pages/witchery-womens-size-guide"],
    lastVerified: "June 2026",
  },
  {
    slug: "seed-heritage",
    name: "Seed Heritage",
    category: "Australian fashion · women's",
    unitNote:
      "Seed Heritage uses AU numeric sizing (4–18) with an XXS–XL letter mapping, and publishes an official AU/UK/US/EU conversion. Its chart is centimetre-native.",
    answer:
      "Seed Heritage is an Australian brand using AU numeric sizing from 4 to 18, with a letter mapping where a 10 is Small, 12 is Medium and 14 is Large, and a centimetre-native chart. A size 10 fits a 90–95cm bust, 70–75cm waist and 97–102cm hip. Seed sizes to a fairly slim, tailored silhouette, so its pieces tend to fit close through the waist and shoulders — shoppers who carry weight there, or who prefer a relaxed fit, often size up one. Unlike most Australian brands, Seed publishes a full international conversion (AU 10 = UK 8 = US 6 = EU 38), which makes it easy to cross-reference against imported labels. Seed is a frequent secondhand find and its tailored pieces hold their shape, so the size tag is reliable for structured items; check the listing photos for any relaxed knitwear, which wears looser than the chart implies.",
    sizeRows: [
      { size: "6", letter: "XXS", bust: "80–85", waist: "60–65", hip: "87–92" },
      { size: "8", letter: "XS", bust: "85–90", waist: "65–70", hip: "92–97" },
      { size: "10", letter: "S", bust: "90–95", waist: "70–75", hip: "97–102" },
      { size: "12", letter: "M", bust: "95–100", waist: "75–80", hip: "102–107" },
      { size: "14", letter: "L", bust: "100–105", waist: "80–85", hip: "107–112" },
      { size: "16", letter: "XL", bust: "105–110", waist: "85–90", hip: "112–117" },
    ],
    hasLetters: true,
    intl: [
      { au: "6", us: "2", uk: "4", eu: "34" },
      { au: "8", us: "4", uk: "6", eu: "36" },
      { au: "10", us: "6", uk: "8", eu: "38" },
      { au: "12", us: "8", uk: "10", eu: "40" },
      { au: "14", us: "10", uk: "12", eu: "42" },
      { au: "16", us: "12", uk: "14", eu: "44" },
    ],
    fitNote:
      "Seed Heritage is cut to a slim, tailored silhouette and fits close through the waist and shoulders, so shoppers who carry weight there or prefer a relaxed fit often size up. Its relaxed knitwear wears looser than the chart implies.",
    faqs: [
      {
        q: "Does Seed Heritage run small?",
        a: "Seed Heritage is cut to a slim, tailored silhouette, fitting close through the waist and shoulders, so people who carry weight there or who prefer a relaxed fit often size up one. Structured pieces sit true to the body chart; only the relaxed knitwear wears looser than the measurements suggest.",
      },
      {
        q: "What is a Seed Heritage size 10 in US sizing?",
        a: "An AU 10 at Seed Heritage equals a UK 8, US 6 and EU 38 on the brand's officially published conversion. A size 10 fits a 90–95cm bust, 70–75cm waist and 97–102cm hip.",
      },
      {
        q: "Is Seed Heritage reliable to buy secondhand?",
        a: "Yes for structured and tailored pieces, which hold their shape and match the size tag. For relaxed knitwear, check the listing photos and any flat measurements, since those styles wear looser than the chart. Measuring the garment against the centimetre figures above is the safest check.",
      },
    ],
    verified: "medium",
    cmConverted: false,
    sources: ["https://www.seedheritage.com/size-chart-woman.html"],
    lastVerified: "June 2026",
  },
  {
    slug: "sportsgirl",
    name: "Sportsgirl",
    category: "Australian fashion · women's",
    unitNote:
      "Sportsgirl uses AU numeric sizing (4–18) with an XXXS–XXL letter mapping. Its chart is centimetre-native with single-point measurements.",
    answer:
      "Sportsgirl is an Australian brand using AU numeric sizing from 4 to 18, with a letter mapping where a 10 is Small, 12 is Medium and 14 is Large, and a centimetre-native chart. A size 10 fits a 90cm bust, 70cm waist and 97cm hip. The useful thing to know about Sportsgirl is that it grades cleanly in 5cm steps across bust, waist and hip, with no vanity sizing, so the tagged number reflects standard Australian body measurements closely and the brand is predictable to buy unseen. Sportsgirl targets a younger market and many of its tops and dresses are cut on the relaxed or cropped side, so the silhouette reads casual even though the underlying measurements are true. Because Sportsgirl pieces turn over quickly and are rarely altered, the AU size tag is dependable secondhand — match your measurements to the centimetre figures and factor in whether a style is fitted or deliberately oversized.",
    sizeRows: [
      { size: "6", letter: "XXS", bust: "80", waist: "60", hip: "87" },
      { size: "8", letter: "XS", bust: "85", waist: "65", hip: "92" },
      { size: "10", letter: "S", bust: "90", waist: "70", hip: "97" },
      { size: "12", letter: "M", bust: "95", waist: "75", hip: "102" },
      { size: "14", letter: "L", bust: "100", waist: "80", hip: "107" },
      { size: "16", letter: "XL", bust: "105", waist: "85", hip: "112" },
    ],
    hasLetters: true,
    fitNote:
      "Sportsgirl grades cleanly in 5cm steps with no vanity sizing, so the tag reflects standard Australian body measurements closely. Many tops and dresses are cut relaxed or cropped, so the silhouette reads casual even though the measurements are true.",
    faqs: [
      {
        q: "Does Sportsgirl fit true to size?",
        a: "Yes — Sportsgirl grades cleanly in 5cm increments across bust, waist and hip with no vanity sizing, so the tagged number reflects standard Australian body measurements and the brand is predictable to buy unseen. Many styles are cut relaxed or cropped, so check whether a piece is fitted or oversized.",
      },
      {
        q: "What is a Sportsgirl size 10 in cm?",
        a: "A Sportsgirl size 10 (Small) fits a 90cm bust, 70cm waist and 97cm hip on the brand's centimetre chart. Each size up adds roughly 5cm to each measurement, so a 12 is a 95cm bust and a 14 is a 100cm bust.",
      },
      {
        q: "Is Sportsgirl reliable to buy secondhand?",
        a: "Yes. Sportsgirl pieces turn over quickly and are rarely altered, so the AU size tag is dependable. Match your body measurements to the centimetre figures above, and factor in whether a style is fitted or deliberately oversized when judging the listing photos.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://www.sportsgirl.com.au/bridget-oversized-shirt-2-082960"],
    lastVerified: "June 2026",
  },
  {
    slug: "cotton-on",
    name: "Cotton On",
    category: "Australian fast fashion · women's",
    unitNote:
      "Cotton On uses AU/UK numeric sizing (4–24) with an alpha overlay (3XS–5XL), and publishes an official AU/US/EU conversion. Its chart is centimetre-native.",
    answer:
      "Cotton On is an Australian brand using AU/UK numeric sizing from 4 to 24, with an alpha overlay from 3XS to 5XL, and a centimetre-native chart. A size 10 (Small) fits a 90cm bust, 72cm waist and 98cm hip. The useful thing to know about Cotton On is that it treats AU and UK numbers as identical (an AU 10 is a UK 10), and publishes a single unified women's chart, so there is no UK offset to worry about. Cotton On's own guidance is to choose the larger size when you fall between two, because many of its tops, tees and dresses are cut on the relaxed, casual side. The brand also carries one of the broader size ranges on the high street, running to a 24. As a high-volume secondhand brand, Cotton On's tags are reliable; measure the garment flat against the chart and lean to the larger size for fitted styles.",
    sizeRows: [
      { size: "6", letter: "2XS", bust: "80", waist: "62", hip: "88" },
      { size: "8", letter: "XS", bust: "85", waist: "67", hip: "93" },
      { size: "10", letter: "S", bust: "90", waist: "72", hip: "98" },
      { size: "12", letter: "M", bust: "95", waist: "77", hip: "103" },
      { size: "14", letter: "L", bust: "101", waist: "83", hip: "109" },
      { size: "16", letter: "XL", bust: "107", waist: "89", hip: "115" },
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
      "Cotton On treats AU and UK numbers as identical and cuts many tops, tees and dresses on the relaxed side. Its own guidance is to choose the larger size when between two — the brand also runs one of the broader size ranges on the high street.",
    faqs: [
      {
        q: "Is Cotton On AU sizing the same as UK?",
        a: "Yes — Cotton On uses a single unified women's chart where the AU and UK numbers are identical, so an AU 10 is a UK 10 with no offset. The official conversion maps that to a US 6 and an EU 38.",
      },
      {
        q: "Does Cotton On run big or small?",
        a: "Cotton On cuts many of its tops, tees and dresses on the relaxed, casual side, and its own size guide recommends choosing the larger size when you fall between two. For a closer fit on a fitted style, measuring the garment flat against the chart is the safest check.",
      },
      {
        q: "What is a Cotton On size 10 in cm?",
        a: "A Cotton On size 10 (Small) fits a 90cm bust, 72cm waist and 98cm hip on the brand's centimetre-native chart. Cotton On carries a broad range from AU 4 up to AU 24, so extended sizes follow the same grading.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://cottonon.com/AU/size-guide.html"],
    lastVerified: "June 2026",
  },
  {
    slug: "asos",
    name: "ASOS",
    category: "Global fast fashion · women's",
    unitNote:
      "ASOS Design uses UK numeric sizing (4–18) as its primary label, with body measurements published in centimetres. Australian sizing follows UK numbers.",
    answer:
      "ASOS is a British online retailer whose own-brand ASOS Design womenswear uses UK numeric sizing from 4 to 18 as the primary label, with body measurements published in centimetres. A UK 10 fits roughly a 91.5cm bust, 72.5cm waist and 96.5cm hip, which equals an Australian 10 and a US 6. The most useful thing to know is that ASOS Design follows standard UK body measurements fairly closely, but because ASOS sells across many sub-ranges, fit can vary by style — the brand itself flags that some lines differ from the base chart. Australian women's sizing matches UK numbers, so there is no conversion needed beyond reading the UK label. ASOS also runs separate Petite, Tall and Curve charts with different proportions. When buying ASOS Design secondhand, work from the UK size and the centimetre measurements together, and check whether a piece belongs to a speciality range before trusting the standard chart.",
    sizeRows: [
      { size: "4", letter: "XS", bust: "81.5", waist: "62", hip: "86.5" },
      { size: "6", letter: "XS", bust: "84", waist: "65", hip: "89" },
      { size: "8", letter: "S", bust: "86.5", waist: "67.5", hip: "91.5" },
      { size: "10", letter: "S/M", bust: "91.5", waist: "72.5", hip: "96.5" },
      { size: "12", letter: "M", bust: "96.5", waist: "77.5", hip: "101.5" },
      { size: "14", letter: "L", bust: "101.5", waist: "82.5", hip: "106.5" },
      { size: "16", letter: "XL", bust: "106.5", waist: "87.5", hip: "112" },
    ],
    hasLetters: true,
    intl: [
      { au: "4", us: "0", uk: "4", eu: "32" },
      { au: "6", us: "2", uk: "6", eu: "34" },
      { au: "8", us: "4", uk: "8", eu: "36" },
      { au: "10", us: "6", uk: "10", eu: "38" },
      { au: "12", us: "8", uk: "12", eu: "40" },
      { au: "14", us: "10", uk: "14", eu: "42" },
      { au: "16", us: "12", uk: "16", eu: "44" },
    ],
    fitNote:
      "ASOS Design follows standard UK body measurements fairly closely, but fit varies by style across the brand's many ranges — ASOS itself flags that some lines differ from the base chart. Petite, Tall and Curve lines use separate charts.",
    faqs: [
      {
        q: "Does ASOS use UK or US sizing?",
        a: "ASOS uses UK sizing as the primary label for its own-brand womenswear — a UK 10, 12 and so on. US shoppers subtract four (UK 12 = US 8), and Australian women's sizing matches the UK numbers directly, so an ASOS UK 10 is an AU 10.",
      },
      {
        q: "What is an ASOS UK 10 in centimetres?",
        a: "An ASOS Design UK 10 fits roughly a 91.5cm bust, 72.5cm waist and 96.5cm hip, equal to an AU 10, US 6 and EU 38. These are body measurements, so measure yourself and match to the chart rather than the finished garment.",
      },
      {
        q: "Why does ASOS sizing vary between items?",
        a: "ASOS carries many sub-ranges and notes that some lines differ from its base chart, so the same UK size can fit differently across styles. Petite, Tall and Curve lines use separate charts entirely, so check which range a piece belongs to before relying on the standard sizing.",
      },
    ],
    verified: "medium",
    cmConverted: false,
    sources: ["https://sizecharter.com/brands/asos/womens"],
    lastVerified: "June 2026",
  },
  {
    slug: "ralph-lauren",
    name: "Ralph Lauren",
    category: "US heritage · women's",
    unitNote:
      "Ralph Lauren women's uses US numeric sizing (0–18) with an XS–XL letter mapping. The brand publishes in inches; centimetres below are converted.",
    answer:
      "Ralph Lauren women's apparel uses US numeric sizing from 0 to 18, with a letter mapping where a 4–6 is Small, 8–10 is Medium and 12–14 is Large. The brand publishes its chart in inches, so the centimetre figures here are converted: a US 8 (Medium) fits roughly a 90cm bust, 72.5cm waist and 98cm hip. The key conversion to remember is that Australian sizing runs four numbers above US sizing, so a US 8 equals an AU 12 and a UK 12. Ralph Lauren's Lauren diffusion line, the one most common in department stores and secondhand, is cut with a little more ease than the designer Collection range, and the brand advises sizing down one if you are between sizes and want a closer fit. Tailored shirts and outerwear are drafted to layer. When buying Ralph Lauren secondhand, confirm whether a piece is the Lauren or the Collection line, since the same US number fits slightly differently between them.",
    sizeRows: [
      { size: "0", letter: "XS", bust: "80", waist: "62", hip: "87.5" },
      { size: "2", letter: "XS", bust: "82.5", waist: "65", hip: "90" },
      { size: "4", letter: "S", bust: "85", waist: "67.5", hip: "92.5" },
      { size: "6", letter: "S", bust: "87.5", waist: "70", hip: "95.5" },
      { size: "8", letter: "M", bust: "90", waist: "72.5", hip: "98" },
      { size: "10", letter: "M", bust: "92.5", waist: "75", hip: "100.5" },
      { size: "12", letter: "L", bust: "96.5", waist: "78.5", hip: "104" },
      { size: "14", letter: "L", bust: "101.5", waist: "84", hip: "106.5" },
      { size: "16", letter: "XL", bust: "106.5", waist: "89", hip: "111.5" },
    ],
    hasLetters: true,
    intl: [
      { au: "4", us: "0", uk: "4", eu: "32" },
      { au: "6", us: "2", uk: "6", eu: "34" },
      { au: "8", us: "4", uk: "8", eu: "36" },
      { au: "10", us: "6", uk: "10", eu: "38" },
      { au: "12", us: "8", uk: "12", eu: "40" },
      { au: "14", us: "10", uk: "14", eu: "42" },
      { au: "16", us: "12", uk: "16", eu: "44" },
    ],
    fitNote:
      "Ralph Lauren's Lauren diffusion line is cut with a little more ease than the designer Collection range, and the brand advises sizing down one if between sizes. Tailored shirts and outerwear are drafted to layer.",
    faqs: [
      {
        q: "What is a Ralph Lauren US 8 in Australian sizing?",
        a: "Australian sizing runs four numbers above US sizing for Ralph Lauren, so a US 8 equals an AU 12 and a UK 12 (EU 40). A US 8 Medium fits roughly a 90cm bust, 72.5cm waist and 98cm hip, converted from the brand's inch chart.",
      },
      {
        q: "Does Ralph Lauren run big or small?",
        a: "The Lauren diffusion line, the most common in department stores and secondhand, is cut with slightly more ease, and Ralph Lauren advises sizing down one if you are between sizes and want a closer fit. The designer Collection range runs a touch trimmer than Lauren at the same number.",
      },
      {
        q: "How do I size Ralph Lauren when buying secondhand?",
        a: "Confirm whether a piece is the Lauren or the Collection line, since the same US number fits slightly differently between them, then match the centimetre measurements above. Remember the AU number is four above the US tag, so a tagged US 8 wears like an AU 12.",
      },
    ],
    verified: "medium",
    cmConverted: true,
    sources: [
      "https://size-charts.com/topics/clothes-size-chart/ralph-lauren-women-size/",
      "https://sizecharter.com/brands/ralph-lauren/womens",
    ],
    lastVerified: "June 2026",
  },
  {
    slug: "tommy-hilfiger",
    name: "Tommy Hilfiger",
    category: "US heritage · women's",
    unitNote:
      "Tommy Hilfiger women's uses AU/UK numeric sizing (4–16) with an XXS–XXL letter mapping, and publishes body measurements natively in centimetres.",
    answer:
      "Tommy Hilfiger women's apparel uses AU/UK numeric sizing from 4 to 16, with a letter mapping where an 8 is Small, 10 is Medium and 12 is Large, and the brand's Australian site publishes body measurements natively in centimetres. A size 10 (Medium) fits an 89–92cm bust, 73–76cm waist and 98–101cm hip. The conversion worth knowing is that Tommy treats AU and UK numbers as the same, while US sizing runs four numbers lower — so an AU 8 is a US 4. Tommy's womenswear follows a classic American sportswear fit with moderate ease, so it generally runs true to its chart; the measurement ranges mean that if you sit at the top of a band, sizing up gives a more relaxed fit. The brand offers extended sizes well beyond a 16. When buying Tommy Hilfiger secondhand, match the centimetre ranges and check whether the tag uses an AU/UK or a US number, since the two differ by four.",
    sizeRows: [
      { size: "4", letter: "XXS", bust: "77–80", waist: "61–64", hip: "86–89" },
      { size: "6", letter: "XS", bust: "81–84", waist: "65–68", hip: "90–93" },
      { size: "8", letter: "S", bust: "85–88", waist: "69–72", hip: "94–97" },
      { size: "10", letter: "M", bust: "89–92", waist: "73–76", hip: "98–101" },
      { size: "12", letter: "L", bust: "93–97", waist: "77–80", hip: "102–105" },
      { size: "14", letter: "XL", bust: "98–102", waist: "82–86", hip: "106–111" },
      { size: "16", letter: "XXL", bust: "102–106", waist: "87–92", hip: "112–116" },
    ],
    hasLetters: true,
    intl: [
      { au: "4", us: "0", uk: "4", eu: "32" },
      { au: "6", us: "2", uk: "6", eu: "34" },
      { au: "8", us: "4", uk: "8", eu: "36" },
      { au: "10", us: "6", uk: "10", eu: "38" },
      { au: "12", us: "8", uk: "12", eu: "40" },
      { au: "14", us: "10", uk: "14", eu: "42" },
      { au: "16", us: "12", uk: "16", eu: "44" },
    ],
    fitNote:
      "Tommy Hilfiger follows a classic American sportswear fit with moderate ease and generally runs true to its centimetre chart. The chart uses ranges, so if you sit at the top of a band, sizing up gives a more relaxed fit.",
    faqs: [
      {
        q: "Is Tommy Hilfiger AU sizing the same as UK?",
        a: "Yes — Tommy Hilfiger maps Australian and UK women's sizes as identical, so an AU 8 is a UK 8. US sizing runs four numbers lower, so that same piece is a US 4 (EU 36). The brand's Australian site publishes measurements in centimetres.",
      },
      {
        q: "Does Tommy Hilfiger run true to size?",
        a: "Generally yes. Tommy's womenswear uses a classic American sportswear fit with moderate ease and follows its body chart closely. Because the chart gives ranges, sitting at the top of a band means sizing up will give a more relaxed fit, while the mid-range is the intended fit.",
      },
      {
        q: "What is a Tommy Hilfiger size 10 in cm?",
        a: "A Tommy Hilfiger AU/UK size 10 (Medium, US 6) fits an 89–92cm bust, 73–76cm waist and 98–101cm hip on the brand's centimetre chart. When buying secondhand, check whether the tag is an AU/UK or US number, since the two differ by four.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: [
      "https://au.tommy.com/size_guide_womens",
      "https://cy.tommy.com/size-guide/women/",
    ],
    lastVerified: "June 2026",
  },
  {
    slug: "princess-polly",
    name: "Princess Polly",
    category: "Australian fashion · women's",
    unitNote:
      "Princess Polly uses AU numeric sizing (4–24) with an XXS–4X letter mapping. Its chart is centimetre-native.",
    answer:
      "Princess Polly is an Australian brand using AU numeric sizing from 4 to 24, with a letter mapping where a 6 is XS, 8 is Small, 10 is Medium and 12 is Large, and its chart is published natively in centimetres. A size 8 fits an 86cm bust, 68cm waist and 94cm hip. The single most useful thing to know about Princess Polly is that fit is category-dependent: tops and dresses run true to size, but pants and bottoms run small, so most shoppers size up one in denim and trousers. Skirts and mini lengths are cut for a standard height around 163cm, so they read shorter on taller frames. Princess Polly footwear runs large, so sizing down is common. Australian sizing follows UK numbers, and the brand publishes a full international conversion (AU 8 = US 4 = UK 8 = EU 36). When buying secondhand, the size tag is reliable for tops and dresses; check garment measurements on bottoms, where the cut runs smallest.",
    sizeRows: [
      { size: "4", letter: "XXS", bust: "78.5", waist: "60.5", hip: "86.5" },
      { size: "6", letter: "XS", bust: "81", waist: "63", hip: "89" },
      { size: "8", letter: "S", bust: "86", waist: "68", hip: "94" },
      { size: "10", letter: "M", bust: "91", waist: "73", hip: "99" },
      { size: "12", letter: "L", bust: "96", waist: "78", hip: "104" },
      { size: "14", letter: "XL", bust: "101", waist: "83", hip: "109" },
      { size: "16", letter: "2X", bust: "107", waist: "89", hip: "115" },
      { size: "18", letter: "3X", bust: "118", waist: "100", hip: "129" },
      { size: "20", letter: "4X", bust: "125", waist: "107", hip: "136" },
      { size: "22", bust: "132", waist: "114", hip: "143" },
      { size: "24", bust: "139", waist: "121", hip: "150" },
    ],
    hasLetters: true,
    intl: [
      { au: "4", us: "0", uk: "4", eu: "32" },
      { au: "6", us: "2", uk: "6", eu: "34" },
      { au: "8", us: "4", uk: "8", eu: "36" },
      { au: "10", us: "6", uk: "10", eu: "38" },
      { au: "12", us: "8", uk: "12", eu: "40" },
      { au: "14", us: "10", uk: "14", eu: "42" },
      { au: "16", us: "12", uk: "16", eu: "44" },
    ],
    fitNote:
      "Princess Polly tops and dresses run true to size, but pants and bottoms run small — size up one in denim and trousers. Minis are cut for around 163cm so read short on taller frames, and footwear runs large.",
    faqs: [
      {
        q: "Does Princess Polly run big or small?",
        a: "It is category-dependent. Princess Polly tops and dresses run true to size, but its pants, bottoms and denim run small, so most shoppers size up one in those. Footwear runs large, so size down. Skirts and minis are cut for a standard height of about 163cm, so they sit shorter on taller frames.",
      },
      {
        q: "What is a Princess Polly size 8 in cm?",
        a: "A Princess Polly size 8 (Small) fits an 86cm bust, 68cm waist and 94cm hip on the brand's centimetre-native chart. The brand also publishes a conversion where an AU 8 equals a US 4, UK 8 and EU 36.",
      },
      {
        q: "Is Princess Polly reliable to buy secondhand?",
        a: "Yes for tops and dresses, which run true to the size tag. For bottoms and denim, where the cut runs small, measure the garment flat against the chart above rather than trusting the label, since sizing up is common on those styles.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: [
      "https://us.princesspolly.com/pages/sizing",
      "https://www.princesspolly.com.au/pages/sizing",
    ],
    lastVerified: "June 2026",
  },
  {
    slug: "decjuba",
    name: "Decjuba",
    category: "Australian fashion · women's",
    unitNote:
      "Decjuba uses AU numeric sizing (6–20) with an XXS–XXXL letter mapping. Its chart is published in centimetres as ranges per size.",
    answer:
      "Decjuba is an Australian brand using AU numeric sizing from 6 to 20, with a letter mapping where a 10 is Small, 12 is Medium and 14 is Large, and its chart is published in centimetres as ranges. A size 12 fits a 94–98cm bust, 75–79cm waist and 102–106cm hip. The most important thing to know about Decjuba is that fit is inconsistent across styles — there is no single run-small or run-large rule, so the same size can fit differently between a knit, a shirt and a tailored piece. Denim is the most variable and the most commonly called out, so check individual garment measurements before buying jeans. Decjuba publishes a full international conversion (AU 12 = US 8 = UK 12 = EU 40), with Australian and UK numbers identical. Because the chart gives ranges, sitting at the top of a band often means the next size up suits better. When buying secondhand, measure the garment flat rather than relying on the tag.",
    sizeRows: [
      { size: "6", letter: "XXS", bust: "79–83", waist: "60–64", hip: "88–91" },
      { size: "8", letter: "XS", bust: "84–88", waist: "65–69", hip: "92–96" },
      { size: "10", letter: "S", bust: "89–93", waist: "70–74", hip: "97–101" },
      { size: "12", letter: "M", bust: "94–98", waist: "75–79", hip: "102–106" },
      { size: "14", letter: "L", bust: "99–103", waist: "80–84", hip: "107–111" },
      { size: "16", letter: "XL", bust: "104–108", waist: "85–89", hip: "112–116" },
      { size: "18", letter: "XXL", bust: "109–113", waist: "90–94", hip: "117–121" },
      { size: "20", letter: "XXXL", bust: "114–119", waist: "95–100", hip: "122–127" },
    ],
    hasLetters: true,
    intl: [
      { au: "6", us: "2", uk: "6", eu: "34" },
      { au: "8", us: "4", uk: "8", eu: "36" },
      { au: "10", us: "6", uk: "10", eu: "38" },
      { au: "12", us: "8", uk: "12", eu: "40" },
      { au: "14", us: "10", uk: "14", eu: "42" },
      { au: "16", us: "12", uk: "16", eu: "44" },
      { au: "18", us: "14", uk: "18", eu: "46" },
      { au: "20", us: "16", uk: "20", eu: "48" },
    ],
    fitNote:
      "Decjuba fit is inconsistent across styles — there is no universal run-small or run-large rule, so the same size fits differently between knits, shirts and tailored pieces. Denim is the most variable; check per-garment measurements.",
    faqs: [
      {
        q: "Does Decjuba run true to size?",
        a: "Not consistently. Decjuba fit varies across styles, with no single run-small or run-large rule, so the same labelled size can fit differently between a knit, a shirt and a tailored piece. Denim is the most variable and most commonly flagged, so check individual garment measurements before buying jeans.",
      },
      {
        q: "What is a Decjuba size 12 in cm?",
        a: "A Decjuba size 12 (Medium) fits a 94–98cm bust, 75–79cm waist and 102–106cm hip on the brand's centimetre chart, which is published as ranges. If you sit at the top of a band, the next size up may suit a tailored piece better.",
      },
      {
        q: "Is Decjuba AU sizing the same as UK?",
        a: "Yes — Decjuba maps Australian and UK women's numbers as identical, so an AU 12 is a UK 12. Its official conversion makes that a US 8 and an EU 40. When buying secondhand, measure the garment flat against the chart, since fit varies by style.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://www.decjuba.com.au/size-guide"],
    lastVerified: "June 2026",
  },
  {
    slug: "forever-new",
    name: "Forever New",
    category: "Australian fashion · women's",
    unitNote:
      "Forever New uses AU/UK numeric sizing (4–18) with an XXS–XXXL letter mapping. Australian and UK numbers are identical, and its chart is centimetre-native.",
    answer:
      "Forever New is an Australian brand using AU/UK numeric sizing from 4 to 18, with a letter mapping where an 8 is Small, 10 is Medium and 12 is Large, and a centimetre-native chart. A size 10 fits a 91cm bust, 73cm waist and 100cm hip. The most useful thing to know about Forever New is that it can run small, particularly through the hips — many shoppers find the waist fits while the hip pulls tight, so sizing up one is common on fitted dresses and skirts. Fit is also inconsistent across styles, so check per-garment model measurements where the brand lists them. Forever New treats Australian and UK numbers as identical and publishes a full conversion (AU 10 = US 6 = UK 10 = EU 38). Because it specialises in occasion and tailored dressing, the size tag is reliable on structured pieces secondhand; just factor in the snug hip when choosing a fitted style.",
    sizeRows: [
      { size: "4", letter: "XXS", bust: "76", waist: "58", hip: "85" },
      { size: "6", letter: "XS", bust: "81", waist: "63", hip: "90" },
      { size: "8", letter: "S", bust: "86", waist: "68", hip: "95" },
      { size: "10", letter: "M", bust: "91", waist: "73", hip: "100" },
      { size: "12", letter: "L", bust: "96", waist: "78", hip: "105" },
      { size: "14", letter: "XL", bust: "101", waist: "83", hip: "110" },
      { size: "16", letter: "XXL", bust: "106", waist: "88", hip: "115" },
      { size: "18", letter: "XXXL", bust: "111", waist: "93", hip: "120" },
    ],
    hasLetters: true,
    intl: [
      { au: "4", us: "0", uk: "4", eu: "32" },
      { au: "6", us: "2", uk: "6", eu: "34" },
      { au: "8", us: "4", uk: "8", eu: "36" },
      { au: "10", us: "6", uk: "10", eu: "38" },
      { au: "12", us: "8", uk: "12", eu: "40" },
      { au: "14", us: "10", uk: "14", eu: "42" },
      { au: "16", us: "12", uk: "16", eu: "44" },
      { au: "18", us: "14", uk: "18", eu: "46" },
    ],
    fitNote:
      "Forever New can run small, especially through the hips — many find the waist fits while the hip pulls tight, so sizing up is common on fitted dresses and skirts. Fit is also inconsistent across styles; check per-garment measurements.",
    faqs: [
      {
        q: "Does Forever New run small?",
        a: "It can, particularly through the hips. Many shoppers find the waist fits while the hip pulls tight, so sizing up one is common on fitted dresses and skirts. Fit is also inconsistent across styles, so check the model or garment measurements the brand lists on individual products.",
      },
      {
        q: "What is a Forever New size 10 in cm?",
        a: "A Forever New size 10 (Medium) fits a 91cm bust, 73cm waist and 100cm hip on the brand's centimetre-native chart. Australian and UK numbers are identical, and the official conversion makes that a US 6 and an EU 38.",
      },
      {
        q: "Is Forever New AU sizing the same as UK?",
        a: "Yes — Forever New maps Australian and UK women's sizes as identical, so an AU 10 is a UK 10, with no offset. Its published conversion makes that a US 6 and an EU 38. When buying secondhand, match the centimetre measurements and allow for the brand's snug hip.",
      },
    ],
    verified: "medium",
    cmConverted: false,
    sources: ["https://forevernew.co.za/pages/size-guide"],
    lastVerified: "June 2026",
  },
  {
    slug: "bardot",
    name: "Bardot",
    category: "Australian fashion · women's",
    unitNote:
      "Bardot uses AU numeric sizing (6–14) with an XS–XL letter mapping. Australian and UK numbers are identical; US sizing runs four numbers lower. Its chart is centimetre-native.",
    answer:
      "Bardot is an Australian brand using AU numeric sizing with an XS to XL letter mapping, where an 8 is Small, 10 is Medium and 12 is Large, and a centimetre-native chart. A size 10 fits a 90cm bust, 72cm waist and 98cm hip. The key thing to know about Bardot is that it fits true to size to slightly small, running snug through the bust and shoulders, because the label's signature is a slim, fitted, often bodycon silhouette. If you are between two sizes or prefer a little ease, sizing up one is the safer choice. Bardot treats Australian and UK numbers as identical, while US sizing runs four numbers lower, so an AU 8 is a US 4 (EU 36). Because the cut is deliberately close-fitting, the size tag is a reliable guide secondhand for the intended fit — just expect a fitted shape rather than a relaxed one, and measure fitted bodices flat to be sure.",
    sizeRows: [
      { size: "6", letter: "XS", bust: "81", waist: "62", hip: "88" },
      { size: "8", letter: "S", bust: "85", waist: "67", hip: "93" },
      { size: "10", letter: "M", bust: "90", waist: "72", hip: "98" },
      { size: "12", letter: "L", bust: "95", waist: "77", hip: "103" },
      { size: "14", letter: "XL", bust: "100", waist: "82", hip: "108" },
    ],
    hasLetters: true,
    intl: [
      { au: "6", us: "2", uk: "6", eu: "34" },
      { au: "8", us: "4", uk: "8", eu: "36" },
      { au: "10", us: "6", uk: "10", eu: "38" },
      { au: "12", us: "8", uk: "12", eu: "40" },
      { au: "14", us: "10", uk: "14", eu: "42" },
    ],
    fitNote:
      "Bardot fits true to size to slightly small, running snug through the bust and shoulders, because its signature silhouette is slim, fitted and often bodycon. If between sizes or wanting ease, size up one.",
    faqs: [
      {
        q: "Does Bardot run small?",
        a: "Bardot fits true to size to slightly small, running snug through the bust and shoulders. Its signature is a slim, fitted, often bodycon silhouette, so if you are between two sizes or prefer a little ease, sizing up one is the safer choice.",
      },
      {
        q: "What is a Bardot size 10 in cm?",
        a: "A Bardot size 10 (Medium) fits a 90cm bust, 72cm waist and 98cm hip on the brand's centimetre chart. Australian and UK numbers are identical, while US sizing runs four lower, so an AU 10 is a US 6 and an EU 38.",
      },
      {
        q: "Is Bardot AU sizing the same as UK?",
        a: "Yes — Bardot maps Australian and UK women's numbers as identical, so an AU 8 is a UK 8, while US sizing runs four numbers lower, making it a US 4 (EU 36). Because the cut is close-fitting, measure fitted bodices flat against the chart when buying secondhand.",
      },
    ],
    verified: "medium",
    cmConverted: false,
    sources: ["https://help.bardot.com/hc/en-us/articles/360000176736"],
    lastVerified: "June 2026",
  },
  {
    slug: "cue",
    name: "Cue",
    category: "Australian fashion · women's",
    unitNote:
      "Cue uses AU numeric sizing (6–14). Its chart is published in centimetres.",
    answer:
      "Cue is one of Australia's best-known tailored workwear labels, and it sizes on a compact AU numeric range from 6 to 14. The chart is published in centimetres: a size 10 fits a 92cm bust, 77cm waist and 103cm hip, with each size stepping evenly by 5cm. Cue publishes official international conversions, where an AU 10 is a UK 12, US 8 and EU 40. That UK mapping sits one step higher than many Australian brands print, so check it before assuming a UK size. Every Cue garment is handmade, and the brand notes slight measurement differences are inherent to the process, so it also publishes per-garment measurements on each product page. When buying Cue secondhand, treat the body chart as the baseline and measure structured pieces like blazers and sheath dresses flat, since tailoring leaves less ease than casual cuts.",
    sizeRows: [
      { size: "6", bust: "82", waist: "67", hip: "93" },
      { size: "8", bust: "87", waist: "72", hip: "98" },
      { size: "10", bust: "92", waist: "77", hip: "103" },
      { size: "12", bust: "97", waist: "82", hip: "108" },
      { size: "14", bust: "102", waist: "87", hip: "113" },
    ],
    hasLetters: false,
    intl: [
      { au: "6", us: "4", uk: "8", eu: "36" },
      { au: "8", us: "6", uk: "10", eu: "38" },
      { au: "10", us: "8", uk: "12", eu: "40" },
      { au: "12", us: "10", uk: "14", eu: "42" },
      { au: "14", us: "12", uk: "16", eu: "44" },
    ],
    fitNote:
      "Cue notes every garment is handmade, with slight measurement differences inherent to the process, and publishes exact per-garment measurements on each product page. Structured tailoring leaves less ease than casual cuts, so measure blazers and fitted dresses flat when buying preloved.",
    faqs: [
      {
        q: "What is a Cue size 10 in cm?",
        a: "A Cue size 10 fits a 92cm bust, 77cm waist and 103cm hip on the brand's official centimetre chart. The chart steps evenly by 5cm per size, running from a size 6 at 82cm bust, 67cm waist and 93cm hip up to a size 14 at 102cm bust, 87cm waist and 113cm hip.",
      },
      {
        q: "What is a Cue size 10 in UK and US sizing?",
        a: "Cue's official conversion maps an AU 10 to a UK 12, US 8 and EU 40. Note the UK number sits one size higher than the AU number, which differs from brands that print AU and UK as the same figure, so convert before buying from UK listings.",
      },
      {
        q: "Why do Cue garments vary slightly in measurements?",
        a: "Cue states each garment is handmade and slight measurement differences are inherent to its manufacturing process. The brand publishes per-garment measurements on individual product pages, so when buying secondhand the safest check is measuring the garment flat against the body chart above.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://www.cue.com/pages/garment-care-and-sizing"],
    lastVerified: "July 2026",
  },
  {
    slug: "sussan",
    name: "Sussan",
    category: "Australian fashion · women's",
    unitNote:
      "Sussan uses AU numeric sizing (6–22) with a letter mapping from XXS to XXXXL. Its chart is published in centimetres.",
    answer:
      "Sussan is a long-running Australian womenswear label sizing from AU 6 to 22, with a published letter mapping where a 10 is Small, 12 is Medium and 14 is Large. The chart is in centimetres: a size 12 fits a 97cm bust, 77cm waist and 104cm hip. Sizes step evenly by 5cm up to a size 18, then by 6cm into the 20 and 22. Sussan publishes no international conversions, but it does publish separate charts for specific categories, including resort wear in combined sizes like S/M, knitwear in split sizes such as XXS/XS, and denim measured on waist and hip only, so the tag format tells you which chart applies. Sussan is a frequent op-shop find in Australia, and pieces mostly carry the numeric tag; check letter-size tags on knitwear against the split-size chart rather than assuming a standard letter fit.",
    sizeRows: [
      { size: "6", letter: "XXS", bust: "82", waist: "62", hip: "89" },
      { size: "8", letter: "XS", bust: "87", waist: "67", hip: "94" },
      { size: "10", letter: "S", bust: "92", waist: "72", hip: "99" },
      { size: "12", letter: "M", bust: "97", waist: "77", hip: "104" },
      { size: "14", letter: "L", bust: "102", waist: "82", hip: "109" },
      { size: "16", letter: "XL", bust: "107", waist: "87", hip: "114" },
      { size: "18", letter: "XXL", bust: "112", waist: "92", hip: "119" },
      { size: "20", letter: "XXXL", bust: "118", waist: "98", hip: "125" },
      { size: "22", letter: "XXXXL", bust: "124", waist: "104", hip: "131" },
    ],
    hasLetters: true,
    fitNote:
      "Sussan's main clothing chart covers AU 6–22 with an XXS–XXXXL letter mapping, but the brand publishes separate charts for resort wear, knitwear and denim, so match the tag format to the right chart. Denim is sized on waist and hip only.",
    faqs: [
      {
        q: "What is a Sussan size 12 in cm?",
        a: "A Sussan size 12 (Medium) fits a 97cm bust, 77cm waist and 104cm hip on the brand's official centimetre chart. Sizes step evenly by 5cm up to a size 18, then by 6cm into the 20 and 22, topping out at a 124cm bust, 104cm waist and 131cm hip.",
      },
      {
        q: "Does Sussan use letter sizing?",
        a: "Both. Every numeric size from 6 to 22 has a published letter mapping, from XXS at a size 6 through XXXXL at a 22. Resort wear and knitwear use combined or split letter sizes like S/M and XXS/XS with their own separate charts, so check which chart matches the tag.",
      },
      {
        q: "Does Sussan publish international size conversions?",
        a: "No. Sussan's official size guide has no US, UK or EU conversion table, only the AU numeric sizes with their letter mapping. Work directly from the centimetre measurements above when comparing against another brand's sizing.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://www.sussan.com.au/sussan-size-guide"],
    lastVerified: "July 2026",
  },
  {
    slug: "dotti",
    name: "Dotti",
    category: "Australian fast fashion · women's",
    unitNote:
      "Dotti uses AU numeric sizing (4–18) with a letter mapping up to XL at size 14. Its chart is published in centimetres.",
    answer:
      "Dotti is an Australian youth fashion label sizing from AU 4 to 18, with a published letter mapping that runs from XXS at a size 4 to XL at a size 14; sizes 16 and 18 carry no letter. The chart is in centimetres: a size 10 (Medium) fits a 90cm bust, 70cm waist and 98cm hip, and every size steps evenly by 5cm. Dotti's published measurements sit a couple of centimetres smaller per size than most mainstream Australian womenswear charts, so check your measurements against the chart rather than assuming your usual AU size. Dotti publishes full international conversions, where an AU 10 is a US 6, UK 10 and EU 38. When buying Dotti secondhand, the numeric tag is the reliable reference; check letter-tagged basics against the mapping above, since the letters stop at XL.",
    sizeRows: [
      { size: "4", letter: "XXS", bust: "75", waist: "55", hip: "83" },
      { size: "6", letter: "XS", bust: "80", waist: "60", hip: "88" },
      { size: "8", letter: "S", bust: "85", waist: "65", hip: "93" },
      { size: "10", letter: "M", bust: "90", waist: "70", hip: "98" },
      { size: "12", letter: "L", bust: "95", waist: "75", hip: "103" },
      { size: "14", letter: "XL", bust: "100", waist: "80", hip: "108" },
      { size: "16", bust: "105", waist: "85", hip: "113" },
      { size: "18", bust: "110", waist: "90", hip: "118" },
    ],
    hasLetters: true,
    intl: [
      { au: "4", us: "0", uk: "4", eu: "32" },
      { au: "6", us: "2", uk: "6", eu: "34" },
      { au: "8", us: "4", uk: "8", eu: "36" },
      { au: "10", us: "6", uk: "10", eu: "38" },
      { au: "12", us: "8", uk: "12", eu: "40" },
      { au: "14", us: "10", uk: "14", eu: "42" },
      { au: "16", us: "12", uk: "16", eu: "44" },
      { au: "18", us: "14", uk: "18", eu: "46" },
    ],
    fitNote:
      "Dotti's chart runs about 2cm smaller per size than most mainstream Australian womenswear labels (a size 10 is a 90cm bust and 70cm waist), reflecting its younger cut. Letter sizes only map up to XL at a size 14; 16 and 18 are numeric only.",
    faqs: [
      {
        q: "What is a Dotti size 10 in cm?",
        a: "A Dotti size 10 (Medium) fits a 90cm bust, 70cm waist and 98cm hip on the brand's official centimetre chart. Every size steps evenly by 5cm, from a size 4 at 75cm bust, 55cm waist and 83cm hip up to a size 18 at 110cm bust, 90cm waist and 118cm hip.",
      },
      {
        q: "Does Dotti run small?",
        a: "Dotti's published chart sits about 2cm smaller per size than most mainstream Australian labels — compare a Dotti 10 at 90cm bust, 70cm waist and 98cm hip with the 92cm bust, 72cm waist and 99cm hip that labels like Sussan and Portmans publish for a 10. If you sit between sizes elsewhere, you may prefer the larger size in Dotti.",
      },
      {
        q: "What is a Dotti size 10 internationally?",
        a: "Dotti's official conversion maps an AU 10 to a US 6, UK 10 and EU 38. Australian and UK numbers are identical across the whole range, while US sizing runs four numbers lower.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://dotti.jgl.com.au/shop/size-guide"],
    lastVerified: "July 2026",
  },
  {
    slug: "portmans",
    name: "Portmans",
    category: "Australian fashion · women's",
    unitNote:
      "Portmans uses AU numeric sizing (6–18) with a letter mapping, plus a separate Curve range (16+–24+). Charts are published in centimetres.",
    answer:
      "Portmans is an Australian workwear-and-going-out label sizing from AU 6 to 18, with a published letter mapping where a 10 is Small, 12 is Medium and 14 is Large. The chart is in centimetres: a size 12 fits a 97cm bust, 77cm waist and 104cm hip. Sizes step evenly by 5cm up to the 16, then jump 8cm into the 18. Portmans also publishes a separate Curve chart running 16+ to 24+, which overlaps the main range at 16 and 18 with identical measurements before extending to a 130cm bust at 24+. International conversions are official: an AU 10 is a US 6, UK 10 and EU 38. When buying Portmans secondhand, check whether a 16 or 18 tag is main range or Curve; the published body measurements match at those sizes, but the Curve line continues up where the main range stops.",
    sizeRows: [
      { size: "6", letter: "XXS", bust: "82", waist: "62", hip: "89" },
      { size: "8", letter: "XS", bust: "87", waist: "67", hip: "94" },
      { size: "10", letter: "S", bust: "92", waist: "72", hip: "99" },
      { size: "12", letter: "M", bust: "97", waist: "77", hip: "104" },
      { size: "14", letter: "L", bust: "102", waist: "82", hip: "109" },
      { size: "16", letter: "XL", bust: "107", waist: "87", hip: "114" },
      { size: "18", letter: "XXL", bust: "115", waist: "95", hip: "122" },
    ],
    hasLetters: true,
    intl: [
      { au: "6", us: "2", uk: "6", eu: "34" },
      { au: "8", us: "4", uk: "8", eu: "36" },
      { au: "10", us: "6", uk: "10", eu: "38" },
      { au: "12", us: "8", uk: "12", eu: "40" },
      { au: "14", us: "10", uk: "14", eu: "42" },
      { au: "16", us: "12", uk: "16", eu: "44" },
      { au: "18", us: "14", uk: "18", eu: "46" },
    ],
    fitNote:
      "Portmans' main chart steps evenly by 5cm per size until a larger 8cm jump from 16 to 18. The separate Curve range (16+–24+) shares identical published measurements at 16 and 18, then extends to a 130cm bust, 110cm waist and 137cm hip at 24+.",
    faqs: [
      {
        q: "What is a Portmans size 12 in cm?",
        a: "A Portmans size 12 (Medium) fits a 97cm bust, 77cm waist and 104cm hip on the brand's official centimetre chart. Sizes step evenly by 5cm up to the 16, then jump 8cm into the 18, which is a 115cm bust, 95cm waist and 122cm hip.",
      },
      {
        q: "What is Portmans Curve sizing?",
        a: "Portmans publishes a separate Curve chart from 16+ to 24+. The 16+ and 18+ match the main range's 16 and 18 measurements exactly, then the chart extends through 20+ (120cm bust, 100cm waist, 127cm hip), 22+ (125cm, 105cm, 132cm) and 24+ (130cm, 110cm, 137cm).",
      },
      {
        q: "What is a Portmans size 10 internationally?",
        a: "Portmans' official conversion maps an AU 10 to a US 6, UK 10 and EU 38. Australian and UK numbers are identical across the range, while US sizing runs four numbers lower.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://portmans.jgl.com.au/shop/size-guide"],
    lastVerified: "July 2026",
  },
  {
    slug: "rockmans",
    name: "Rockmans",
    category: "Australian fashion · women's",
    unitNote:
      "Rockmans uses AU numeric sizing (8–24) with a letter mapping to XXL at size 18. Its chart is published in centimetres, jointly for Rockmans and Table Eight.",
    answer:
      "Rockmans is a long-running Australian womenswear label focused on sizes 8 to 24, and its official chart, published jointly for Rockmans and Table Eight, is in centimetres. Unusually, most sizes are published as ranges rather than single figures: a size 12 (Medium) fits a 97 to 99cm bust, 80 to 81cm waist and 106 to 107cm hip. Letter sizes map from XS at a size 8 through XXL at an 18, while the 20, 22 and 24 carry numeric labels only. The extended upper range is the practical strength here, reaching a 129cm bust, 112cm waist and 138cm hip at a size 24. Rockmans publishes no international conversions, so work from the centimetre figures directly. When buying Rockmans or Table Eight secondhand, the same chart applies to both labels, and measuring the garment flat against the range for your size is the safest check.",
    sizeRows: [
      { size: "8", letter: "XS", bust: "87", waist: "69", hip: "95" },
      { size: "10", letter: "S", bust: "92–93", waist: "75", hip: "96–102" },
      { size: "12", letter: "M", bust: "97–99", waist: "80–81", hip: "106–107" },
      { size: "14", letter: "L", bust: "102–104", waist: "85–86", hip: "111–112" },
      { size: "16", letter: "XL", bust: "107–109", waist: "90–91", hip: "116–117" },
      { size: "18", letter: "XXL", bust: "112–117", waist: "95–99", hip: "121–125" },
      { size: "20", bust: "119", waist: "102", hip: "128" },
      { size: "22", bust: "124", waist: "107", hip: "133" },
      { size: "24", bust: "129", waist: "112", hip: "138" },
    ],
    hasLetters: true,
    fitNote:
      "Rockmans publishes most sizes as measurement ranges rather than single figures (a size 12 spans a 97–99cm bust), and the chart covers an extended 8–24 range. Letter sizes stop at XXL (size 18); 20–24 are numeric only. The same chart covers Table Eight.",
    faqs: [
      {
        q: "What is a Rockmans size 12 in cm?",
        a: "A Rockmans size 12 (Medium) fits a 97 to 99cm bust, 80 to 81cm waist and 106 to 107cm hip. Rockmans publishes most sizes as measurement ranges rather than single figures, so if you fall at the top of a range, consider the next size up.",
      },
      {
        q: "What sizes does Rockmans go up to?",
        a: "The official chart runs from a size 8 to a size 24, one of the wider ranges among Australian labels. A size 24 fits a 129cm bust, 112cm waist and 138cm hip. Letter sizes stop at XXL (size 18); the 20, 22 and 24 are numeric only.",
      },
      {
        q: "Is Table Eight sizing the same as Rockmans?",
        a: "Yes. The official size chart is published jointly as the Rockmans and Table Eight size chart, so the same centimetre measurements apply to both labels. If you know your size in one, it carries across to the other.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://www.rockmans.com.au/rockmans-womens-size-guide.html"],
    lastVerified: "July 2026",
  },
  {
    slug: "sheike",
    name: "Sheike",
    category: "Australian fashion · women's",
    unitNote:
      "Sheike uses AU numeric sizing (6–18) with no letters on its main chart. Its chart is published in centimetres.",
    answer:
      "Sheike is an Australian occasion and going-out label sizing on AU numerics from 6 to 18, with its chart published in centimetres. A size 10 fits a 93cm bust, 73cm waist and 102cm hip, and every size steps evenly by 5cm. The main body chart carries no letter sizing; Sheike publishes letters only for knitwear and outerwear, where an XS maps to a size 6, Small to an 8, Medium to a 10, Large to a 12 and XL to a 14 to 16. The brand itself cautions that varying designs mean the guide may not apply to every product and that different materials stretch differently, so check per-item fit details. When buying Sheike secondhand, note whether the piece is knitwear or outerwear with a letter tag, and map it back to the numeric chart before comparing measurements.",
    sizeRows: [
      { size: "6", bust: "83", waist: "63", hip: "92" },
      { size: "8", bust: "88", waist: "68", hip: "97" },
      { size: "10", bust: "93", waist: "73", hip: "102" },
      { size: "12", bust: "98", waist: "78", hip: "107" },
      { size: "14", bust: "103", waist: "83", hip: "112" },
      { size: "16", bust: "108", waist: "88", hip: "117" },
      { size: "18", bust: "113", waist: "93", hip: "122" },
    ],
    hasLetters: false,
    fitNote:
      "Sheike's own guide cautions that varying designs mean the chart may not apply to every product, and that different materials stretch differently. Knitwear and outerwear use a separate letter chart (XS = 6 through XL = 14–16); everything else is AU numeric.",
    faqs: [
      {
        q: "What is a Sheike size 10 in cm?",
        a: "A Sheike size 10 fits a 93cm bust, 73cm waist and 102cm hip on the brand's official centimetre chart. Every size steps evenly by 5cm, from a size 6 at 83cm bust, 63cm waist and 92cm hip up to a size 18 at 113cm bust, 93cm waist and 122cm hip.",
      },
      {
        q: "Does Sheike use letter sizing?",
        a: "Only for knitwear and outerwear, which have their own published mapping: XS is a size 6, Small an 8, Medium a 10, Large a 12 and XL a 14 to 16. Everything else uses AU numeric sizing from 6 to 18 with no letter labels.",
      },
      {
        q: "Does Sheike sizing fit true across all styles?",
        a: "Sheike itself notes that varying designs mean its sizing guide may not apply to all products, and that different materials have varying degrees of stretch. When buying secondhand, check the style's fit details where possible, and measure the garment flat against the chart above for fitted occasion pieces.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://www.sheike.com.au/pages/size-guide"],
    lastVerified: "July 2026",
  },
  {
    slug: "kmart",
    name: "Kmart",
    category: "Australian department stores · women's",
    unitNote:
      "Kmart uses AU numeric sizing with no letter labels, published in centimetres and inches. Kmart's own chart continues to a size 26, but we show it only to 22 — see the note below the table.",
    answer:
      "Kmart is Australia's biggest discount department store, and its clothing all hangs off one published body chart covering tops, bottoms, dresses and jackets, including underwear and shapewear but not bras. Sizing is AU numeric only, with no letter labels anywhere on the chart. A size 12 fits a 95cm bust, 76cm waist and 101cm hip, and sizes step evenly by 5cm through the range. Kmart's own chart continues past a size 22 to a 26, but its published waist figures at 24 and 26 break that even 5cm grading, so we show the chart only to a size 22 rather than republish measurements we believe are wrong; check Kmart's own guide for the larger sizes and measure the garment's waist. Kmart also adds separate plus-size (18 to 26) and maternity (8 to 18) charts with their own measurements, so check the right chart for those labels. Because Kmart pieces are everywhere secondhand, the numeric tag plus the chart above is usually all you need to size a piece confidently.",
    sizeRows: [
      { size: "6", bust: "80", waist: "61", hip: "86" },
      { size: "8", bust: "85", waist: "66", hip: "91" },
      { size: "10", bust: "90", waist: "71", hip: "96" },
      { size: "12", bust: "95", waist: "76", hip: "101" },
      { size: "14", bust: "100", waist: "81", hip: "106" },
      { size: "16", bust: "105", waist: "86", hip: "111" },
      { size: "18", bust: "110", waist: "91", hip: "116" },
      { size: "20", bust: "115", waist: "96", hip: "121" },
      { size: "22", bust: "120", waist: "101", hip: "126" },
      // Sizes 24 and 26 deliberately omitted. Kmart publishes waist 116cm at 24
      // and 121cm at 26, a +15cm jump from the 101cm at 22 that breaks its own
      // even 5cm grading; the inches toggle carries the same anomaly, so it reads
      // as an error in Kmart's chart rather than a transcription slip. Kmart has
      // no standalone chart URL (the source is a site-wide product-page modal) and
      // kmart.com.au returns 403 to fetchers, so the figures cannot be independently
      // confirmed. Per the accuracy contract at the top of this file we omit rather
      // than republish a suspect measurement. Do not restore without a verifiable source.
    ],
    hasLetters: false,
    fitNote:
      "Kmart's single chart covers tops, bottoms, dresses and jackets, including underwear and shapewear but not bras. Separate plus-size (18–26) and maternity (8–18) charts use different measurements, so a plus or maternity label needs its own chart, not this one.",
    faqs: [
      {
        q: "What is a Kmart size 12 in cm?",
        a: "A Kmart size 12 fits a 95cm bust, 76cm waist and 101cm hip on the official chart, which Kmart publishes in both centimetres and inches. Sizes step evenly by 5cm through the core range, so a 10 is 90cm, 71cm and 96cm, and a 14 is 100cm, 81cm and 106cm.",
      },
      {
        q: "Does Kmart use letter sizes like S, M and L?",
        a: "No. Kmart's women's clothing chart is AU numeric only, with no published letter equivalents. Measure against the centimetre chart directly rather than converting from a letter size you wear in another brand.",
      },
      {
        q: "What sizes does the Kmart women's chart cover?",
        a: "Kmart's own chart runs from a size 6 to a 26, but the table above stops at 22. Kmart's published waist reads 116cm at a size 24 and 121cm at a 26, a jump from 101cm at a size 22 that breaks its otherwise even 5cm grading and looks like an error in Kmart's chart. Rather than republish a measurement we think is wrong, we have left those two rows out; check Kmart's own guide for sizes 24 and 26 and measure the garment's waist. Kmart also publishes separate plus-size (18 to 26) and maternity (8 to 18) charts with their own measurements, so check those when a garment is tagged plus or maternity.",
      },
    ],
    verified: "medium",
    cmConverted: false,
    sources: [
      "https://www.kmart.com.au/product/short-sleeve-cotton-t-shirt-s169511/",
    ],
    lastVerified: "July 2026",
  },
  {
    slug: "target-australia",
    name: "Target Australia",
    category: "Australian department stores · women's",
    unitNote:
      "Target uses AU numeric sizing (4–20) with a letter printed against every size; several letters span two sizes. Its chart is published in centimetres.",
    answer:
      "Target Australia publishes one womenswear body chart covering sizes 4 to 20, with a letter printed against every size. The letters repeat across neighbouring sizes: both a 4 and 6 are XXS, a 14 and 16 are both L, and an 18 and 20 are both XL, so several Target letter sizes span two numeric sizes. The chart is in centimetres: a size 12 (Medium) fits a 93cm bust, 76cm waist and 101cm hip. Petite sizes (4P to 16P) share the regular chart's measurements with a shorter 72cm average inseam. Target's plus range uses a plus sign and its own chart, running 16+ to 28+, and the measurements differ substantially from the core chart, with a 16+ at 115cm bust versus 103cm for a straight 16. When buying Target secondhand, read the tag carefully: a P or + changes which chart applies.",
    sizeRows: [
      { size: "4", letter: "XXS", bust: "76", waist: "59", hip: "84" },
      { size: "6", letter: "XXS", bust: "80", waist: "63", hip: "88" },
      { size: "8", letter: "XS", bust: "84", waist: "67", hip: "92" },
      { size: "10", letter: "S", bust: "88", waist: "71", hip: "96" },
      { size: "12", letter: "M", bust: "93", waist: "76", hip: "101" },
      { size: "14", letter: "L", bust: "98", waist: "81", hip: "106" },
      { size: "16", letter: "L", bust: "103", waist: "86", hip: "111" },
      { size: "18", letter: "XL", bust: "109", waist: "92", hip: "117" },
      { size: "20", letter: "XL", bust: "115", waist: "98", hip: "123" },
    ],
    hasLetters: true,
    fitNote:
      "Target prints a letter against every numeric size, and several letters span two sizes (14 and 16 are both L; 18 and 20 are both XL). Petite (P) sizes share the regular measurements with a 72cm average inseam; the plus (+) range 16+–28+ has its own, larger chart.",
    faqs: [
      {
        q: "What is a Target size 12 in cm?",
        a: "A Target size 12 (Medium) fits a 93cm bust, 76cm waist and 101cm hip on the official centimetre chart, which runs from a size 4 to a 20. Note the step sizes grow slightly at the top of the range: an 18 is a 109cm bust and a 20 is 115cm.",
      },
      {
        q: "What is the difference between a Target 16 and a 16+?",
        a: "They come from different charts. A straight 16 on the main womenswear chart is a 103cm bust, 86cm waist and 111cm hip, while a 16+ on the plus chart is a 115cm bust, 103.5cm waist and 121cm hip. The plus range runs 16+ to 28+, so always check for the plus sign on the tag.",
      },
      {
        q: "What letter size is a Target 14 or 16?",
        a: "Both are L on Target's own chart. The letters repeat at several points: 4 and 6 are both XXS, 14 and 16 are both L, and 18 and 20 are both XL. That makes the numeric size plus the centimetre chart the reliable reference, not the letter.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://www.target.com.au/size-chart/wmnswear"],
    lastVerified: "July 2026",
  },
  {
    slug: "big-w",
    name: "Big W",
    category: "Australian department stores · women's",
    unitNote:
      "Big W publishes two separate systems: AU numeric (6–18, single values) and letters (XXS–3XL, ranges), with no stated equivalence. Charts are in centimetres.",
    answer:
      "Big W publishes two separate women's sizing systems side by side: an AU numeric chart from 6 to 18 and an independent letter chart from XXS to 3XL, and it never states a numeric-to-letter equivalence, so treat a numeric tag and a letter tag as different systems. The numeric chart uses single centimetre values, with a size 12 at a 95cm bust, 75cm waist and 100cm hip, stepping evenly by 5cm. The letter chart uses ranges instead, with a Medium spanning a 92 to 98cm bust, 72 to 78cm waist and 97 to 103cm hip. Both cover tops, pants, dresses, jackets, jumpers and activewear; sleepwear has near-identical separate charts. Big W's plus range runs 16 to 26 with its own, larger measurements, where a plus 16 is a 115cm bust against 105cm on the core chart, so check which chart a larger-size tag belongs to before comparing.",
    sizeRows: [
      { size: "6", bust: "80", waist: "60", hip: "85" },
      { size: "8", bust: "85", waist: "65", hip: "90" },
      { size: "10", bust: "90", waist: "70", hip: "95" },
      { size: "12", bust: "95", waist: "75", hip: "100" },
      { size: "14", bust: "100", waist: "80", hip: "105" },
      { size: "16", bust: "105", waist: "85", hip: "110" },
      { size: "18", bust: "110", waist: "90", hip: "115" },
    ],
    hasLetters: false,
    fitNote:
      "Big W runs two independent published systems: numeric 6–18 (single values) and letter XXS–3XL (ranges), with no stated equivalence between them. The plus chart (16–26) is much larger at the same number: a plus 16 is a 115cm bust versus 105cm on the core chart.",
    faqs: [
      {
        q: "What is a Big W size 12 in cm?",
        a: "A Big W size 12 fits a 95cm bust, 75cm waist and 100cm hip on the numeric chart, which runs from 6 to 18 in even 5cm steps. The chart covers tops, pants, dresses, jackets, jumpers and activewear.",
      },
      {
        q: "What is a Big W size Medium in cm?",
        a: "Big W's letter chart is separate from its numeric chart and is published as ranges: a Medium spans a 92 to 98cm bust, 72 to 78cm waist and 97 to 103cm hip. The letter chart runs from XXS (76 to 81cm bust) to 3XL (116 to 122cm bust), and Big W states no equivalence between letters and numeric sizes.",
      },
      {
        q: "How does Big W plus sizing differ from the regular chart?",
        a: "The plus chart runs 16 to 26 with much larger measurements at the same number: a plus 16 is a 115cm bust, 98cm waist and 120cm hip versus 105cm, 85cm and 110cm for a regular 16. The plus range tops out at a 140cm bust, 123cm waist and 145cm hip at a 26.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://www.bigw.com.au/size-chart"],
    lastVerified: "July 2026",
  },
  {
    slug: "bonds",
    name: "Bonds",
    category: "Australian basics · women's",
    unitNote:
      "Bonds uses letter sizing (XXS–3XL) on its women's clothing chart, with no numeric labels. The chart is published in centimetres.",
    answer:
      "Bonds sizes its women's clothing on letters alone, from XXS to 3XL, with no AU numeric labels published on the clothing chart, so don't assume your usual 10 or 12 maps to a particular letter. The chart is in centimetres: a Medium fits a 92cm bust, 73cm waist and 98cm hip, and every size steps evenly by 5cm, from an XXS at 77cm bust to a 3XL at 112cm. One detail worth knowing: Bonds specifies its hip measurement is taken 20cm below the waist, so measure there rather than at the widest point when checking against this chart. Bonds publishes many separate charts for its other categories, including bras, underwear, leggings, sleep and swim, and those don't share these numbers. Because Bonds basics turn up constantly secondhand, the letter tag plus the chart above sizes most pieces; for bras, band and cup sizing applies instead.",
    sizeRows: [
      { size: "XXS", bust: "77", waist: "58", hip: "83" },
      { size: "XS", bust: "82", waist: "63", hip: "88" },
      { size: "S", bust: "87", waist: "68", hip: "93" },
      { size: "M", bust: "92", waist: "73", hip: "98" },
      { size: "L", bust: "97", waist: "78", hip: "103" },
      { size: "XL", bust: "102", waist: "83", hip: "108" },
      { size: "XXL", bust: "107", waist: "88", hip: "113" },
      { size: "3XL", bust: "112", waist: "93", hip: "118" },
    ],
    hasLetters: false,
    fitNote:
      "Bonds' hip figure is specified as measured 20cm below the waist, not at the widest point. The clothing chart covers general apparel only; bras, underwear, leggings, sleep and swim each have their own separate Bonds charts.",
    faqs: [
      {
        q: "What is a Bonds size Medium in cm?",
        a: "A Bonds Medium fits a 92cm bust, 73cm waist and 98cm hip on the official women's clothing chart. Sizes step evenly by 5cm from an XXS (77cm bust, 58cm waist, 83cm hip) to a 3XL (112cm bust, 93cm waist, 118cm hip).",
      },
      {
        q: "Does Bonds use AU numeric sizes like 10 and 12?",
        a: "Not on its women's clothing chart, which is letter-only from XXS to 3XL with no published numeric mapping. Rather than converting from a numeric size you wear elsewhere, measure yourself against the centimetre chart directly.",
      },
      {
        q: "How does Bonds measure hips on its size chart?",
        a: "Bonds' chart specifies the hip is measured 20cm below the waist, which can differ from the fullest-point hip measurement most brands use. If your hips are widest lower than that, check both figures before choosing a size.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://www.bonds.com.au/size-charts"],
    lastVerified: "July 2026",
  },
  {
    slug: "atmos-and-here",
    name: "Atmos&Here",
    category: "Australian fashion · women's",
    unitNote:
      "Atmos&Here uses AU numeric sizing (6–18) with an international letter mapping. Its chart is published in centimetres.",
    answer:
      "Atmos&Here is The Iconic's in-house Australian womenswear label, and its official chart, published on The Iconic's size guide, runs AU 6 to 18 with an international letter against every size. The chart is in centimetres: a size 10 (Medium) fits an 89cm bust, 73cm waist and 99cm hip. Note where the letters sit: Atmos&Here maps XS to a size 6 and Medium to a 10, whereas many Australian labels put XS at an 8 and Medium at a 12, so an Atmos&Here letter tag reads one step different from what you might expect. Sizes step evenly by 5cm until the final jump to 18, which adds 6cm, reaching a 110cm bust, 94cm waist and 120cm hip. No US, UK or EU conversion is published. Secondhand, Atmos&Here pieces are common; the size tag plus this chart is normally enough to buy confidently.",
    sizeRows: [
      { size: "6", letter: "XS", bust: "79", waist: "63", hip: "89" },
      { size: "8", letter: "S", bust: "84", waist: "68", hip: "94" },
      { size: "10", letter: "M", bust: "89", waist: "73", hip: "99" },
      { size: "12", letter: "L", bust: "94", waist: "78", hip: "104" },
      { size: "14", letter: "XL", bust: "99", waist: "83", hip: "109" },
      { size: "16", letter: "XXL", bust: "104", waist: "88", hip: "114" },
      { size: "18", letter: "3XL", bust: "110", waist: "94", hip: "120" },
    ],
    hasLetters: true,
    fitNote:
      "Atmos&Here's letter mapping sits one step lower than many Australian labels: XS is a size 6 and Medium a 10, where brands like Gorman, Sussan and Portmans put XS at an 8 and Medium at a 12. Go by the numeric size and the centimetre chart.",
    faqs: [
      {
        q: "What is an Atmos&Here size 10 in cm?",
        a: "An Atmos&Here size 10 (Medium) fits an 89cm bust, 73cm waist and 99cm hip on the official chart. Sizes step evenly by 5cm until the last step to a size 18, which adds 6cm and reaches a 110cm bust, 94cm waist and 120cm hip.",
      },
      {
        q: "Does Atmos&Here letter sizing match other Australian brands?",
        a: "No. Atmos&Here maps XS to a size 6 and Medium to a size 10, while many Australian labels, including Gorman, Sussan and Portmans, publish XS at an 8 and Medium at a 12. When buying secondhand, trust the numeric size and the centimetre measurements over the letter.",
      },
      {
        q: "Who makes Atmos&Here?",
        a: "Atmos&Here is The Iconic's in-house label, and its size chart is published on The Iconic's official size guide as provided by the brand. No US, UK or EU conversions are published for it, so work from the centimetre chart directly.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: [
      "https://www.theiconic.com.au/index/sizeguidemain?brand=Atmos%26Here=&for=AA&gender=female&sku=AT049AA03WA",
    ],
    lastVerified: "July 2026",
  },
  {
    slug: "review-australia",
    name: "Review Australia",
    category: "Australian fashion · women's",
    unitNote:
      "Review uses AU numeric sizing (6–22) with no letter labels. Its chart is published in centimetres with an inch toggle.",
    answer:
      "Review Australia is an occasionwear label known for fit-and-flare dresses, sizing on AU numerics from 6 to 22 with no letter labels. The chart is in centimetres: a size 10 fits a 91cm bust, 72cm waist and 99cm hip, and every size steps evenly by 5cm, topping out at a 121cm bust, 102cm waist and 129cm hip at a 22. Review publishes an official conversion where Australian and UK numbers are identical, US sizing runs four numbers lower and EU runs from 32 to 48, so an AU 10 is a UK 10, US 6 and EU 36. The brand's own guide notes measurements may vary between garments due to fabric, fit and style. Because Review dresses are structured and fitted through the bodice, measuring a secondhand piece flat against the chart is the safest check, especially on styles with little stretch.",
    sizeRows: [
      { size: "6", bust: "81", waist: "62", hip: "89" },
      { size: "8", bust: "86", waist: "67", hip: "94" },
      { size: "10", bust: "91", waist: "72", hip: "99" },
      { size: "12", bust: "96", waist: "77", hip: "104" },
      { size: "14", bust: "101", waist: "82", hip: "109" },
      { size: "16", bust: "106", waist: "87", hip: "114" },
      { size: "18", bust: "111", waist: "92", hip: "119" },
      { size: "20", bust: "116", waist: "97", hip: "124" },
      { size: "22", bust: "121", waist: "102", hip: "129" },
    ],
    hasLetters: false,
    intl: [
      { au: "6", us: "2", uk: "6", eu: "32" },
      { au: "8", us: "4", uk: "8", eu: "34" },
      { au: "10", us: "6", uk: "10", eu: "36" },
      { au: "12", us: "8", uk: "12", eu: "38" },
      { au: "14", us: "10", uk: "14", eu: "40" },
      { au: "16", us: "12", uk: "16", eu: "42" },
      { au: "18", us: "14", uk: "18", eu: "44" },
      { au: "20", us: "16", uk: "20", eu: "46" },
      { au: "22", us: "18", uk: "22", eu: "48" },
    ],
    fitNote:
      "Review's own guide notes measurements may vary between garments due to fabric, fit and style. The chart runs AU 6–22 in even 5cm steps with no letter sizing; occasion styles are often structured with limited stretch, so measure fitted bodices flat.",
    faqs: [
      {
        q: "What is a Review size 12 in cm?",
        a: "A Review size 12 fits a 96cm bust, 77cm waist and 104cm hip on the official chart. Sizes step evenly by 5cm from a size 6 (81cm bust, 62cm waist, 89cm hip) to a size 22 (121cm bust, 102cm waist, 129cm hip).",
      },
      {
        q: "What is a Review size 10 in UK and US sizing?",
        a: "Review's official conversion maps an AU 10 to a UK 10 (identical numbers), a US 6 and an EU 36. US sizing runs four numbers below the AU size across the whole range.",
      },
      {
        q: "Where does Review publish its size chart?",
        a: "Inside the Size Guide panel on each product page, which has a Body Measurements view with a centimetre and inch toggle, plus a separate Conversion Guide tab for UK, EU and US sizing. The measurements are the same brand-wide body chart across products.",
      },
    ],
    verified: "high",
    cmConverted: false,
    sources: ["https://review-australia.com/products/lilian-dress-ink"],
    lastVerified: "July 2026",
  },
];

export function getBrand(slug: string): Brand | undefined {
  return BRANDS.find((b) => b.slug === slug);
}

export const BRAND_SLUGS = BRANDS.map((b) => b.slug);
