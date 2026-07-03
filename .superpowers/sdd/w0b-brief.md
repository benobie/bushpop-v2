# Task W0b — Port sell.css from the design prototype

## Where this fits

We're building the "List an item" sell wizard in `apps/market` (bushpop-v2 Launch-2). The
approved visual design lives in a static HTML prototype. This task ports its CSS into the real
app as a standalone stylesheet the wizard components will use. It does NOT build any React
components — just the CSS file.

## Repo

Worktree root: `/Users/ben/projects/bushpop-v2.worktrees/feat/phase-2-sell-wizard`
Work only inside `apps/market/**`. Do not touch `apps/web/**`, `packages/**`, or root config.

## Source to read

`/Users/ben/projects/Bushpop/design/home/sell.html` — a 1470-line static HTML file. Read the
whole file. It contains a `<style>` block with ALL of the sell wizard's CSS (stepper, panels,
step nav, dropzone, option cards, toggles, measurement rows, price/payout panel, shipping
panel, review checklist, sticky aside, strength gauge, sticky mobile bottom bar, buyer-preview
card, etc.) plus rules for features we are NOT building day 1.

## What to port vs drop

**Port:** every structural/layout rule for the wizard chrome the plan actually builds: stepper
dots + progress bar, step panel show/hide, nav buttons, dropzone + photo thumb grid + framing
guide chips, option-card / toggle / chip components, measurement-row layout, price/payout panel
layout, shipping option cards, review summary rows + checklist, sticky aside card, strength
gauge SVG styling, `.pcard`-family classes (`.pcard`, `.pimg`, `.pname`, `.psave`, `.prrp`,
`.pprice`, `.psize`) for the live buyer-preview, mobile sticky bottom action bar, toast/wobble
animations, `.btn` and `.btn:disabled` styling, and the consolidated `prefers-reduced-motion`
media query (trim it down to only the rules for animations you actually ported).

**Drop entirely** (not built day 1 — do not port these rules, even partially):
- `fxbar` — the auto-enhance toggle bar on the Photos step
- badges — the seller badges shelf/toast
- `pviz` — the price histogram / comp-band visualization
- offers — the open-to-offers toggle + auto-decline floor UI
- progression — the XP/level/streak/daily-quest journey card

If you're unsure whether a rule belongs to an excluded feature, check its class name against the
prototype's JS (search the file for where that class is toggled) — excluded-feature classes are
only referenced by code for the features above.

## Design tokens — use this EXACT frozen contract, do not invent your own names

The prototype's CSS uses generic var names (`--green`, `--ink`, etc.) that don't exist in this
app. `apps/market`'s existing global theme (`packages/config/tailwind/tokens.css`) is a
*different, unrelated* piklo-inherited coral/trust colour system — do NOT touch that file and do
NOT rely on its `--color-brand`/`--color-trust` tokens. Instead, scope a fresh set of CSS custom
properties to the wizard itself so it renders with the approved Bushpop green/ink look without
touching apps/market's existing global design system. Declare exactly this block at the top of
the new file, on a `.sell-wizard` class (values are the real hex codes from
`apps/web/src/app/globals.css`'s `@theme` block, Launch-1's design system):

```css
.sell-wizard {
  --sell-ink: #1d1d1f;
  --sell-ink-2: #6e6e73;
  --sell-ink-3: #86868b;
  --sell-paper: #ffffff;
  --sell-surface: #f5f5f7;
  --sell-surface-alt: #fafafa;
  --sell-green: #16b34a;
  --sell-green-ink: #0a7d33;
  --sell-green-cta: #15c250;
  --sell-red: #e0362f;
  --sell-red-2: #c62822;
  --sell-line: rgba(0, 0, 0, 0.08);
  --sell-line-2: rgba(0, 0, 0, 0.12);
  --sell-radius-card: 18px;
  --sell-radius-card-lg: 26px;
}
```

Every ported rule must reference `var(--sell-*)` (e.g. `var(--sell-green)`) instead of the
prototype's `var(--green)` or hard-coded hex. Do not add a `--sell-font-*` variable — use
`apps/market`'s existing fonts: apply `font-family: var(--font-display)` (already defined by
`apps/market/src/app/layout.tsx` via `next/font`) for the head-style/display text the prototype
used a heavier font for, and let body text inherit the app's default `font-body` class. This is
a deliberate documented deviation from the prototype (which used Hanken Grotesk) — do not import
a new font family.

For `.pcard .sale` / `.pcard .psave` (red accents), use `var(--sell-red)`. Note: this file is
also referenced by a separate live-preview-card component being built in a parallel task
(`listing-preview-card.tsx`) — that component ships its own small colocated stylesheet and does
NOT depend on this file, so don't worry about cross-file coordination there.

## Destination

`apps/market/src/components/sell/sell.css` — a plain CSS file (not a CSS module; components
will `import "./sell.css"` once, e.g. from the wizard root client component built in a later
task). Do not create the wizard root component yourself — this task is CSS only.

## Acceptance criteria

- File is valid CSS (no syntax errors) — you can sanity-check with
  `pnpm --filter @bushpop/market exec node -e "require('fs').readFileSync('src/components/sell/sell.css','utf8')"`
  or just careful reading; there's no CSS linter wired in this repo yet.
- Every colour value in the file traces back to a `var(--sell-*)` custom property, never a raw
  hex (except inside the `.sell-wizard { ... }` block itself, where the hex values are defined).
- No rules for fxbar/badges/pviz/offers/progression made it in.
- `prefers-reduced-motion` block only contains rules for animations actually present in the
  ported file.

## Report

Report DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, the commit hash(es), which
prototype class groups you ported vs dropped (short bullet list), and any concerns. Commit with
message prefix `feat(market): `.
