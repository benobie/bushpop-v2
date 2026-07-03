# Task W0d — Analytics lib for the sell wizard

## Where this fits

The sell wizard needs to fire GA4 events at specific points (start, step-complete, AI draft
generated/kept/edited, publish). This task builds ONLY the tracking library (the `track()`
function, the typed event union, and the production-hostname gate) plus a unit test for the
gate. It does NOT wire any call sites into wizard components — a later task does that.

## Repo

Worktree root: `/Users/ben/projects/bushpop-v2.worktrees/feat/phase-2-sell-wizard`
Work only inside `apps/market/src/lib/**` and its test files. Do not touch `apps/web/**`,
`packages/**`, or root config. This task depends on the vitest scaffold from task W0a already
being in place (`apps/market/vitest.config.ts`, `apps/market/src/test/setup.ts`) — if those
files don't exist yet when you start, note it in your report as a concern but still write the
test file (it will just fail to run until W0a lands; do not block on it).

## Precedent to follow

Read `apps/web/src/components/analytics.tsx` in full — it implements a production-hostname gate
for GA4/GTM on the Launch-1 content site (`PROD_HOSTS = new Set(["bushpop.com.au",
"www.bushpop.com.au"])`, only firing when `window.location.hostname` is in that set). The sell
wizard must use the **exact same host set** — this is a deliberate cross-app consistency
decision, not a bug: GA4 should never fire on any staging host (CF Pages preview, `market.
bushpop.xyz`, etc.) in either app, only on the eventual unified production domain.

## What to build

`apps/market/src/lib/analytics.ts`:

1. A frozen `const PROD_HOSTS = new Set(["bushpop.com.au", "www.bushpop.com.au"])` (copy
   verbatim from the precedent — do not add market-specific hosts).
2. A typed event union (discriminated by an `event` field) covering exactly these events:
   ```ts
   type SellAnalyticsEvent =
     | { event: "sell_start"; resumed: boolean }
     | { event: "sell_step_complete"; step: number; ms: number }
     | { event: "ai_draft_generated" }
     | { event: "ai_draft_kept"; field: string }
     | { event: "ai_draft_edited"; field: string }
     | {
         event: "sell_publish";
         strength: number;
         time_to_list_ms: number;
         photos: number;
         ai_used: boolean;
       };
   ```
3. `export function track(event: SellAnalyticsEvent): void` — if
   `typeof window === "undefined"` return immediately (SSR safety); if
   `!PROD_HOSTS.has(window.location.hostname)` return immediately (do nothing on non-prod
   hosts); otherwise push the event onto `window.dataLayer` (gtag/GTM convention), creating
   `window.dataLayer` as `[]` first if it doesn't exist yet. Type `window.dataLayer` via a
   minimal global augmentation (`declare global { interface Window { dataLayer?:
   Record<string, unknown>[] } }`) scoped to this file.

## Test

`apps/market/src/lib/__tests__/analytics.test.ts` (or `.tsx` if needed) — unit tests for the
hostname gate using vitest, following whatever mocking convention is idiomatic for this stack
(e.g. `vi.stubGlobal` or directly reassigning `window.location` via
`Object.defineProperty(window, "location", {...})` in jsdom). Cover:
- `track()` on a non-prod hostname (e.g. `"market.bushpop.xyz"` or `"localhost"`) does NOT push
  to `window.dataLayer`.
- `track()` on `"bushpop.com.au"` DOES push the exact event object to `window.dataLayer`.
- `track()` on `"www.bushpop.com.au"` DOES push.
- Calling `track()` twice appends two entries (dataLayer is a queue, not overwritten).

## Acceptance criteria

- `pnpm --filter @bushpop/market typecheck` clean.
- If the W0a test scaffold is present, `pnpm --filter @bushpop/market test` runs this file and
  it passes.

## Report

Report DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, the commit hash(es), a one-line test
summary, and any concerns (especially if the W0a scaffold wasn't present yet). Commit with
message prefix `feat(market): `.
