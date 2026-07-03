# Task W0e — Shared listing-preview-card component

## Where this fits

The sell wizard has a persistent "live buyer preview" in its aside AND a full preview tab on
the Review step, both rendering the seller's in-progress draft as it would look as a real shop
card. This task builds that ONE shared component so both call sites stay visually identical.
It does NOT wire it into the wizard itself — a later task imports and uses it.

## Repo

Worktree root: `/Users/ben/projects/bushpop-v2.worktrees/feat/phase-2-sell-wizard`
Work only inside `apps/market/src/components/sell/**`. Do not touch `apps/web/**`,
`packages/**`, or root config.

## Precedent to port from

Read `apps/web/src/components/product-card.tsx` in full — it's the real Launch-1 `.pcard`
buyer-facing card (image, sale badge, RRP strikethrough with SAVE badge, price, size/condition/
brand line). Also read the `.pcard`-family CSS rules it depends on: open
`apps/web/src/app/globals.css` and read lines 320–438 (the "Product card" section) for the exact
visual spec (border radii, sale badge styling, price typography, etc.) — you'll re-implement
these rules, not import that file.

## What to build

`apps/market/src/components/sell/listing-preview-card.tsx` — a **client component**
(`"use client"`) named `ListingPreviewCard` that renders a `.pcard`-equivalent from **partial,
possibly-incomplete draft state** (this is a live preview during editing, not a real listing —
most fields may be empty at any point). Props (all optional except a stable key/no id needed):

```ts
interface ListingPreviewCardProps {
  title?: string | null;
  priceCents?: number | null;
  rrpCents?: number | null;
  coverImageUrl?: string | null;
  brand?: string | null;
  size?: string | null;
  condition?: string | null;
}
```

Rendering rules:
- If `coverImageUrl` is missing, render a neutral placeholder block (e.g. a plain grey box with
  a simple "photo" icon or just empty grey background) instead of a broken `<img>` — this is the
  most common state (wizard starts with no photos).
- If `title` is missing, show a light placeholder string like "Your item title" in a muted
  colour, so the card never looks broken while editing.
- SAVE badge + RRP strikethrough only render when `rrpCents` is present AND greater than
  `priceCents` (if `priceCents` is also present) — same logic as `product-card.tsx`'s
  `saved`/`pct` calculation, adapted to cents: `saved = rrpCents - priceCents`, `pct =
  Math.round((saved / rrpCents) * 100)`.
- Price line: format `priceCents` as dollars.cents (e.g. 18525 → "$185" main + "25" superscript,
  matching `product-card.tsx`'s `dollars`/`sup` split — check `apps/web/src/lib/demo-products.ts`
  for the exact `priceParts()` helper this is based on if it's easy to find, otherwise
  implement equivalent logic: `dollars = Math.floor(cents / 100)`, `cents2 = cents % 100`
  zero-padded to 2 digits). If `priceCents` is missing entirely, show a muted "—" instead.
- Bottom meta line: `${size ?? "Size"} • ${condition ?? "Condition"} • ${brand ?? "Brand"}` —
  each falls back to its own muted placeholder label independently (fields fill in one at a
  time as the seller progresses through steps).
- This card is **not a link** (unlike the real `.pcard`, which links to the shop) — it's a pure
  preview, not navigable. Render a plain `<div>`, not a `<Link>`/`<a>`.

## Styling

Do NOT depend on `apps/web`'s CSS or on the sell wizard's `sell.css` (built in a parallel task
you should not assume has landed yet). Instead create a small colocated stylesheet
`apps/market/src/components/sell/listing-preview-card.css` with the `.pcard`-equivalent classes,
using hard-coded hex values directly (not CSS custom properties) so this component renders
correctly completely standalone:
- Card ink/text: `#1d1d1f` (title, price), `#6e6e73` (meta line), `#86868b` (RRP strikethrough)
- Sale/SAVE badge background: `#e0362f`, white text
- Card image background (placeholder): `#eceef0`
- Border radius on the image: `14px`
Match the layout structure (image → title → save/rrp row → price → meta line) and rough
typography scale from `product-card.tsx` / the CSS you read, but you have latitude on exact
pixel values since this is a standalone port, not a byte-identical copy.
Import the CSS file directly in the component (`import "./listing-preview-card.css"`).

## Acceptance criteria

- `pnpm --filter @bushpop/market typecheck` clean.
- Component renders sensibly with zero props (fully empty draft — no crashes, sensible
  placeholders).
- Component renders sensibly with a fully-populated draft (all fields present, RRP > price so
  the SAVE badge shows).
- Write one RTL unit test (`apps/market/src/components/sell/__tests__/listing-preview-card.test.tsx`)
  covering both of those states (empty draft shows placeholders; full draft shows the SAVE badge
  and correct price split) — if `apps/market/vitest.config.ts` doesn't exist yet (parallel task
  W0a may not have landed), still write the test file and note it in your report; don't skip it.

## Report

Report DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, the commit hash(es), a one-line test
summary, and any concerns. Commit with message prefix `feat(market): `.
