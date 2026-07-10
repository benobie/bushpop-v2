# Design-parity findings — 2026-07-10

Captured by `apps/market/scripts/design-parity-report.mjs` against
`https://market.bushpop.xyz` (staging) and the approved prototypes in
`~/projects/Bushpop/design/home/`.

**This is a reporting artefact, not a gate.** Nothing here blocks a merge. It
exists so the gap between the shipped app and the approved design is written
down rather than carried in someone's head.

## Scope

Three unauthenticated, prototype-backed routes. Checkout and confirmation are
excluded — they require an authenticated session with a populated bag, which a
read-only staging capture cannot produce without placing a test order against
staging Stripe.

| Route | Prototype | Verdict |
| --- | --- | --- |
| `/` | `bushpop-home-v3.html` | Large gap — app is a thin subset |
| `/shop` | `shop.html` | Structurally close; copy drift |
| `/listing/…` | `product.html` | Structurally close; sparse |

## Two things that look like bugs and are not

Recording these because both cost time to rule out, and the next person to open
these screenshots will draw the same wrong conclusion.

1. **Product images render as flat colour blocks** (beige, brown, black, blue)
   across home, shop and PDP. These are **not broken images**. PR #81 made the
   dev/staging seed synthesize a solid-colour JPEG per fixture and upload it to
   R2. Verified: the R2 object returns `200 image/jpeg` (4,019 bytes), and
   `/_next/image` returns `200 image/jpeg` at every allowed width.

2. **`/_next/image?…&w=800` returns 400.** That is correct Next.js behaviour —
   `800` is not in the default `deviceSizes`/`imageSizes` arrays, so the
   optimizer rejects it. Requests at `640/750/828/1080` all return `200`. Do not
   "fix" the `remotePatterns` config on the strength of a hand-rolled `w=800`
   curl; it is a red herring, and it nearly became a finding in this report.

## Findings

### 1. Home is a thin subset of the prototype (expected, but worth quantifying)

The prototype home is a full marketplace front page. The app ships the hero, a
"Shop by category" duo, a "Latest listings" rail, and the footer.

Present in the prototype and **absent** from the app: the hero image collage and
search-with-suggestions, the trust strip (buyer protection / cash out / tracked
shipping / Australian-owned), "How it works", "Popular this week", the "Turn your
wardrobe into cash" seller band, "Shop by style" tiles, the brand-logo marquee,
the "Whose wardrobe are we filling?" gender duo, "Loved by buyers and sellers"
testimonials + stat row, "Top-rated storefronts", the "Half the price. Twice the
love." manifesto band, "Based on your recent views", "Recently viewed", and the
drop-alerts email capture.

This is a **product/content decision, not a defect**. Much of the missing
content is also blocked on the trust-claims ledger (`docs/trust-claims-ledger.md`)
— the testimonials, the `4,800+`/`1,600+`/`4.7` stat row, and the "Top-rated
storefronts" ratings are all fabricated fixture data in the prototype and cannot
ship until they render from real data. The gender duo is the exception: it is
built and merged (BF-15 PR 2, #122) but renders `null` when either gender has
zero live listings, which is the case on staging with 5 seeded listings.

### 2. `/shop` route renamed, but the visible copy still says "Browse"

BF-15 PR 1 (#119) renamed the route `/browse` → `/shop`. The user-visible strings
did not follow:

- `apps/market/src/app/shop/page.tsx:74` — the PLP `<h1>` reads **"Browse"**.
- `apps/market/src/app/shop/page.tsx:20` — the page `<title>` metadata is
  **"Browse"**, so the drift is indexed by search engines, not just cosmetic.
- `apps/market/src/app/page.tsx:23` — the home hero CTA reads **"Browse all"**.
- `apps/market/src/app/search/page.tsx:133` — "Browse all".
- The site footer's SHOP column, plus empty-state CTAs in `bag/`, `orders/`,
  `account/favourites/` and `account/searches/`, all say "Browse listings".

The prototype calls this surface **Shop** throughout. This is a real copy
inconsistency between the URL and the page, and the `<title>` case has mild SEO
weight. Not fixed here — this session owns tests and tooling, and
`apps/market/src` belongs to the concurrent batch-50 sessions. Suggested as a
follow-up (see PR body).

### 3. PDP is structurally faithful but visually sparse

Gallery-left / details-right, fact chips (brand, size, condition, colour), price,
the approved "Buyer Protection on every order" reassurance line, Add to bag,
Save, description — all match the prototype's structure.

The prototype additionally shows a thumbnail strip, seller card with rating,
shipping/returns accordions, measurements panel, and a "You might also like"
rail. The seeded fixtures carry one image and no measurements, so some of this
gap is fixture-shaped rather than code-shaped and cannot be judged from staging
as currently seeded.

### 4. Nav and footer match well

`SiteNav` (wordmark, search pill, green Sell CTA, Sign up / Log in, bag icon) and
`SiteFooter` (obsidian, four columns) are close to the prototype at both
viewports. The BF-01 obsidian/grey palette swap reads correctly — no coral
survives anywhere in the captures.

## Regenerating

```bash
node apps/market/scripts/design-parity-report.mjs
```

Requires `~/projects/Bushpop/design/home/` to exist locally, which is why this
can never run in CI. Images are JPEG q60, capped at 5MB total (currently 2.2MB
across 12 captures); the script fails rather than committing an oversized
artefact.
