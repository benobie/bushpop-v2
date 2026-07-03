# Trust-claims ledger — removed homepage claims and their reinstatement conditions

**Created:** 03/07/2026, alongside the W3 trust-claims gate fix (`apps/web/src/app/page.tsx` and friends).
**Purpose:** every fabricated or unverifiable claim removed from the site is recorded here verbatim, with the exact condition that must be true before a version of it can return. Nothing here is banned forever. It is banned *until it is true and provable*.
**Rules of reinstatement:** a claim comes back only when (a) the underlying system or data exists in production, (b) the number is pulled from real data, not typed in, and (c) the wording passes the claims whitelist rules (Australian English, no em dashes, honest claims only). Approved whitelist and banned list: see the 02/07/2026 W3 handoff and `bushpop-homepage-trust-claims-gate` memory.

---

## 1. Stats row (removed from homepage `STATS`)

| Original copy | Why removed | Reinstate when | Future version |
|---|---|---|---|
| "1,600+ pieces listed" | The 1,666 WordPress products are stale catalogue, not live marketplace listings. Nothing is listed on v2. | Live marketplace has real listings; number computed from the listings table at build/render time. | "X pieces listed", live count, rounded down. |
| "4,800+ members" | The 4,836 registered WP users include heavy fraud-bot signup volume; not honest "members". | Member migration done at L2 launch, fraud accounts excluded, count pulled from real user table. | "X members" only after the fraud-exclusion pass (see launch-time reconciliation plan). |
| "1–2 days avg dispatch" | Invented. No dispatch data exists. | Marketplace shipping events tracked; median dispatch computed over a trailing window with real volume (suggest minimum 50 shipped orders). | "Typically ships in X days", computed. |
| "100% Aussie sellers" | Aspirational policy stated as current fact; unverifiable pre-launch. | Seller onboarding enforces AU-only (address/ABN check or equivalent) and that rule is live. | "All sellers are Australian" once enforcement exists. |

## 2. Aggregate rating badge (removed)

Original: **"★★★★★ 4.7 / 5 from 1,248 buyers and sellers"** under heading "Loved by buyers and sellers".

- Why removed: entirely invented. No review system exists; 103 legit orders ever.
- Reinstate when: a real review system is live AND there is a defensible sample. Suggest gate: ≥50 real reviews before any aggregate is shown. Number rendered from the reviews table, never hardcoded. If aggregate-rating structured data is added, it must match the visible number exactly.
- Future version: "★ X.X from N reviews", computed, linked to the actual reviews.

## 3. Named testimonials (removed `REVIEWS`)

Original four, all fictional people:

1. "Found a grail Carhartt jacket for a third of retail. Arrived spotless." — Aisha K., verified buyer
2. "Sold my whole winter wardrobe in a week. The label printing is genius." — Tom R., seller
3. "Everything is authenticated, so I actually trust the designer listings." — Priya M., verified buyer
4. "Aussie sellers, quick postage, no customs nonsense. My new default." — Jack D., verified buyer

- Why removed: invented people and quotes; #2 and #3 also assert services that don't exist (label printing, authentication).
- Reinstate when: real customers give real quotes with recorded consent (email or in-app permission kept on file). "Verified buyer" tag only for accounts with a completed order.
- Future version: real quotes, first name + initial, consent logged, linked to the order where practical.

## 4. Top-rated storefronts (section removed, `SELLERS`)

Original: heading "Top-rated storefronts", eyebrow "Real Aussie sellers", four invented stores:

| Store | Handle | Claimed rating | Claimed sold | Claimed ship time |
|---|---|---|---|---|
| Marlowe Vintage | @marlowe | 5.0 | 240 | 1 day |
| Northside Threads | @northside | 4.9 | 512 | 2 days |
| Sole Society | @solesociety | 4.9 | 388 | 1 day |
| The Reset Room | @resetroom | 4.8 | 176 | 2 days |

- Why removed: stores, ratings, sales counts and ship times all fabricated. "Top-rated" language is banned until a rating system with real data exists.
- Reinstate when: real sellers with real listings exist. First honest version needs NO ratings: "New on Bushpop" or "Browse sellers" cards showing store name, real listing count and cover image only. "Top-rated" specifically returns only when the review system has enough per-seller volume to rank honestly.
- Future version, staged: (1) real seller cards, no numbers → (2) add real sold counts → (3) add ratings and "top-rated" ranking once reviews exist.

## 5. Trust microbar items (two removed, two reworded)

| Original | Status | Reinstate when |
|---|---|---|
| "Free authentication" | REMOVED. Contradicts locked model fact "no swap or verification service". Also parked in the W3 handoff (opt-in authentication). | An actual authentication service exists AND the locked model facts are formally changed. Then wording per whatever the real service is (e.g. "Optional authentication on designer items"). |
| "Secure checkout" | REMOVED. No checkout exists on v2 yet. | Checkout is live on a real payment rail (Stripe). Then it is a plain product fact and can return as-is. |
| "Buyer protection" | KEPT, reworded to whitelist form "Buyer Protection on every order". | n/a |
| "Australian support" | KEPT, reworded to whitelist form "Human support, based in Australia". "Support team" wording stays parked until there is more than one person. | "team" wording: when headcount > 1. |

## 6. Payment method badges (removed)

Original: **Afterpay, Zip, PayPal, VISA** pill badges in the trust microbar.

- Why removed: implies these methods are accepted at checkout. No v2 checkout exists; the planned rail is Stripe. Afterpay/Zip were never confirmed.
- Reinstate when: checkout is live; show only the methods actually enabled, verified against the payment config. This one is cheap to bring back and worth doing at launch (payment logos are honest, effective trust signals when true).

## 7. Seller benefits panel (rewritten `SELLER_BENEFITS`)

| Original | Problem | Replaced with | Original returns when |
|---|---|---|---|
| "List in 60 seconds — Snap, price, publish. Our tools do the fiddly bits." | Unverified speed claim; listing tool doesn't exist yet. | "List for free — Photograph your pieces, set a price and publish. No listing fees." | Listing flow exists and a timed median supports the number (or drop the number: "List in minutes"). |
| "No storefront fees — Open a store and list for free. Keep more of every sale." | "Keep MORE of every sale" implied a commission exists; model is no seller commission. | "Keep what you make — No seller commission on anything you sell." | n/a — replacement is the stronger, true claim. |
| "Paid securely — Funds are protected and released once the buyer's happy." | Describes an escrow/release flow that doesn't exist. | "You ship direct — Post the order straight to the buyer once it sells." | Stripe (or equivalent) payout flow with actual hold/release logic is live. Then reinstate with wording matching the real flow. |
| "We print the label — Prepaid, tracked postage — just pack and drop off." | Label-printing service doesn't exist. Also em dashes. | "Human support — Real people, based in Australia, at support@bushpop.com.au." | A real prepaid-label integration ships (candidate feature for the listing-tool wedge). Wording then: "Prepaid, tracked postage. Just pack and drop off." |

## 8. Discount and social-proof numbers on product surfaces

| Original | Where | Why removed | Reinstate when |
|---|---|---|---|
| "Up to 80% off" chip | Shop-by-brand section | Invented sitewide discount stat. | Live listings exist; compute the real max/typical RRP discount from listing data. |
| ★ rating (4.6–5.0) per product card | `demo-products.ts` + `product-card.tsx` | Fabricated per-item ratings on illustrative demo products. | Real listings + real review data; card pulls from the reviews table. Fields were deleted from `DemoProduct` — reintroduce on the real product type only. |
| "N saved" per product card (8–52) | same | Fabricated save counts. | Real favourite/save events exist; render live counts (consider a minimum threshold so "1 saved" doesn't look worse than nothing). |
| "Brands Australia loves" eyebrow | Shop-by-brand | Popularity sentiment with no data. Replaced with "The labels you know". | Real sales/search data can support a popularity claim, or just keep the neutral line. |

Kept, for the record: demo product prices, RRPs and per-item "-X%" sale badges remain on the clearly-disclaimed illustrative preview cards ("Illustrative preview. Live listings arrive at launch."). At launch, demo products are replaced by real listings and RRP claims must then be sourced (seller-entered RRP is a future moderation question).

## 9. Copy style fixes (not claims, recorded for completeness)

- Em dashes removed from all rendered homepage copy, the site `<title>` ("Bushpop — …" → "Bushpop | …") and the Organization JSON-LD description. The no-em-dash rule binds all future site copy.
- Hero sub-line reworded: "Vintage, streetwear & designer — pre-loved…" → "Vintage, streetwear and designer. Preloved, from sellers right across Australia."
- Hero gained the approved honest-history line: "Preloved fashion, bought and sold Australia-wide. Trading since 2024."

## 10. Parked claims (never shipped, wanted later — from the W3 handoff)

| Claim | Blocker | Unblock path |
|---|---|---|
| Refund guarantee | Policy undefined. | Write the refund policy into the Terms first; then claim exactly what the policy says. |
| Opt-in authentication | Contradicts locked model facts; no service exists. | Change the model facts + build/contract the service, then see §5. |
| "Support team" wording | One person answers support. | Headcount > 1. |

## 11. About and selling explainer pages (03/07/2026 sweep)

Follow-up to the first "Known remaining issues" item below (now closed). Files: `apps/web/src/app/about/how-it-works/page.mdx`, `apps/web/src/app/about/buying/page.mdx`, `apps/web/src/app/about/selling/page.mdx`, `apps/web/src/app/selling/how-to-sell-on-bushpop-the-complete-guide/page.mdx`.

| Original copy | Where | Why removed or rewritten | Reinstate when |
|---|---|---|---|
| "condition and the seller's ratings" (buyer step); "Seller ratings build over time so the community can buy with confidence" | how-it-works | Rating system does not exist (see §2). Now future tense: "Seller reviews are coming with the marketplace launch." | Review system live with real data, per §2. |
| "check the photos, measurements and the seller's ratings"; "**Check the seller's ratings** and read recent reviews" (buyer tip) | buying | Same as §2. Ratings tip replaced with a read-the-listing-closely tip. | Same as §2. |
| "Positive ratings build over time and make every future listing easier to sell" | complete selling guide | Same as §2. Rewritten to the future-tense form. | Same as §2. |
| "Bushpop releases the payment"; "your payment is protected while the order is completed"; "Payments are held securely until an order is completed... funds are there before they post"; "**Get paid** once the buyer receives the item" | how-it-works | Escrow hold/release flow does not exist (§7). Replaced with Buyer Protection whitelist framing and keep-your-full-asking-price wording. | Stripe (or equivalent) hold/release payout flow is live; wording must match the real flow (§7). |
| "Your payment is held safely until your order is completed" | buying | Same as §7. | Same as §7. |
| "their payment is held securely"; "Funds are released to you once the buyer receives the item" | about/selling | Same as §7. | Same as §7. |
| "payment is held securely by Bushpop... funds are **released to your connected payment method**"; "payouts can be released after a sale" | complete selling guide | Same as §7. Replaced with free-to-sell whitelist claims plus "Exact payout mechanics will be confirmed when the marketplace launches." | Same as §7. |
| "Bushpop accepts major cards and common online payment methods" | buying | No checkout exists; methods unconfirmed (§6). Now future tense: "Checkout will take major cards when the marketplace launches, with the exact payment options confirmed then." | Checkout live; list only the methods actually enabled (§6). |
| "Browse **thousands** of preloved pieces"; "Browse thousands of pre-loved items" (meta description) | how-it-works, buying | Invented volume; nothing is listed on v2 (§1). Now count-free wording. | Live listings exist; any count computed from the listings table (§1). |
| "Sellers post items directly to you, usually within a couple of business days" | buying | Behavioural dispatch claim with no data (§1). Now stated as the ask: "are asked to post within two business days". | Real dispatch data over a trailing window (§1). |
| "our support team" (three instances) | how-it-works, buying, complete selling guide | "team" wording parked until headcount > 1 (§5). Now whitelist form: human support, based in Australia. | Headcount > 1 (§5). |
| "Found a seller you like? Follow them to see their new listings first"; "keeps your shop visible to followers" | buying, complete selling guide | Follow feature unverified/unbuilt. Dropped or reworded to "visible to buyers". | Follow feature ships. |
| "you can always consider offers" | complete selling guide | Offers feature unverified/unbuilt. Now "you can always reduce the price later". | Offers feature ships. |
| "Search Bushpop and other marketplaces for what comparable items actually sold for" | complete selling guide | No browsable sold history on Bushpop pre-launch. Now "Search other marketplaces". | Live marketplace with sold-listing data worth citing. |
| "Buy securely through Bushpop" / "buy securely" / "We handle secure payments" / "covers secure payment" (two instances) | all four | Same class as the removed "Secure checkout" badge (§5); no checkout exists. Reworded to Buyer Protection whitelist framing / "payment processing". | Checkout live on a real payment rail (§5). |

Also recorded:

- Each of the four pages gained one launch-framing sentence ("The new marketplace is launching soon; here is how ... will work" style, consistent with the `/shop` coming-soon page). **Remove these at L2 launch** and restore plain present tense.
- Em dashes cleared from all rendered copy in these four files: body prose, `title:` metadata ("—" → "|", per the §9 homepage precedent), the complete-guide H1 and ArticleJsonLd headline ("—" → ":"), and the Size Charts link text. Verified nothing anchor-links into these pages, so the H1 slug change is safe.
- Kept as approved: the 7% Buyer Protection fee (matches live homepage copy), "Buyer Protection on every order" framing, free to sell / no seller commission / keep your full asking price, ship direct, "marketplaces that charge sellers around 10% or more" (true of eBay/Depop-class competitors), and "takes minutes to start" (§7's sanctioned no-number form of the speed claim).

**Leftover sweep (03/07/2026, batch 36B).** A read-only pass over the rest of `apps/web/src/app` (outside this section's original four files) found two more instances of the same claim classes:

| Original copy | Where | Why removed or rewritten | Reinstate when |
|---|---|---|---|
| "our support team is based in Australia" | `guides/how-to-buy-secondhand-clothes-online` | Same as the §11 "team" wording fix above (§5). Now whitelist form: "human support, based in Australia". | Headcount > 1 (§5). |
| "**Check seller ratings** and read recent reviews." | `guides/vinted-australia` | Platform-agnostic tip (Vinted/eBay/Depop have real ratings) sitting on a Bushpop page with no attribution. Reworded to "Check seller ratings and reviews on platforms that have them." | n/a — already platform-neutral wording, no Bushpop-specific claim involved. |

## Known remaining issues (outside the homepage fix)

- ~~`about/how-it-works`, `about/buying` and the selling guide MDX pages describe seller ratings/reviews as a current feature.~~ CLOSED 03/07/2026 — see §11.
- Em dashes remain throughout the MDX guides and `brands.ts` AIO copy. Site-wide sweep is a separate, careful job (AIO answer blocks are load-bearing for SEO). The four §11 pages are now clean.
