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
];

export function getBrand(slug: string): Brand | undefined {
  return BRANDS.find((b) => b.slug === slug);
}

export const BRAND_SLUGS = BRANDS.map((b) => b.slug);
