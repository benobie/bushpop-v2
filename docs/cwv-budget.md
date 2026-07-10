# Core Web Vitals budget

Tooling for ROADMAP 3.2. A measurable, enforceable CWV budget for the market
app's three SEO-critical unauthenticated pages.

## Running it

```bash
node apps/market/scripts/cwv-budget.mjs                       # staging (default)
node apps/market/scripts/cwv-budget.mjs --base http://localhost:3002
node apps/market/scripts/cwv-budget.mjs --trials 1            # quick look
node apps/market/scripts/cwv-budget.mjs --json out.json       # machine-readable
```

Read-only (GETs only), so it is safe to point at staging. Exit code is `1` if any
metric breaches its **ceiling**, `0` otherwise.

Budgets live in [`apps/market/cwv-budgets.json`](../apps/market/cwv-budgets.json).

## Why Lighthouse, not a Playwright web-vitals harness

Every CWV number recorded for this app so far (batches 40, 42, 43 — quoted in
`.claude/CLAUDE.md`) came from Lighthouse mobile with Lantern simulated
throttling. Reusing the same tool keeps the series comparable across sessions.
A Playwright `PerformanceObserver` harness would measure an unthrottled desktop
browser on a fast connection, produce much prettier numbers, and be comparable
to nothing.

Lighthouse is run via `npx -y lighthouse` rather than added as a devDependency —
it is a large dependency tree used by one occasional script, not by the app.

`--no-sandbox` is required: headless Chrome throws `CHROME_INTERSTITIAL_ERROR`
against `market.bushpop.xyz` without it in this environment.

## The two-tier budget

A single budget set at Google's "good" thresholds would be red on every page from
day one (LCP is 3.0–3.9s across the board), and a permanently-red check is noise
that teaches everyone to ignore it. A single budget set at today's numbers would
bless the current state as the goal. So there are two tiers:

| Tier | Meaning | On breach |
| --- | --- | --- |
| `target` | Google's "good" threshold. Where we want to be. | **warn** (exit 0) |
| `ceiling` | Regression guard, set above today's median. | **fail** (exit 1) |

Ceilings follow one rule:

```
ceiling = max(target, measured_median × ~1.2)
```

The consequence is deliberate and worth stating plainly:

- **CLS and TBT are already inside target on every page**, so their ceiling *is*
  the target. They must stay good — any regression past the "good" threshold
  fails the check immediately.
- **LCP is short of target on every page**, so it gets ~20% headroom over
  today's median to absorb Lighthouse's real run-to-run variance. It cannot get
  *worse* without failing, but it is not expected to pass `target` yet.

Re-baseline deliberately, when a page's content genuinely changes. Never
re-baseline to turn a red run green — that is the one move this file exists to
prevent.

## Baselines (2026-07-10)

Lighthouse mobile, median of 3 trials, against `https://market.bushpop.xyz`.

| Page | LCP | CLS | TBT |
| --- | --- | --- | --- |
| Home `/` | 3.93s | 0.000 | 28ms |
| Shop (PLP) `/shop` | 3.17s | 0.008 | 36ms |
| Listing (PDP) `/listing/…` | 3.02s | 0.000 | 35ms |

These are consistent with the last recorded numbers (batch 43: home ~4.3–4.6s,
browse ~2.9s), so nothing has regressed — home has drifted slightly *better*.

**LCP variance is large, and you should expect it.** A second median-of-3 run
taken minutes later on the same commit gave Shop `1.67s` (vs `3.17s` above) and
Home `3.98s` (vs `3.93s`). Median-of-3 damps outliers but does not eliminate
them — staging is a single shared container behind a CDN, and cache warmth moves
LCP by seconds. **Never treat a single ceiling breach as a regression**: re-run
it, and prefer `--trials 5` when the result will inform a decision. CLS and TBT
are far more stable than LCP, which is exactly why their ceilings can sit right
on the target.

### Why LCP is ~3s and not ~2.5s

This is understood, and it is not an unfixed bug. Batch 43 root-caused it with
real Lighthouse runs: server response time is ~150ms (the `'use cache'` layer is
working), the LCP image downloads in ~250ms with a correct `fetchpriority=high`,
and the residual gap is **main-thread work rendering above-the-fold content**,
amplified by Lighthouse's ~4× mobile CPU throttling. Closing it further means
trimming what's above the fold — a product call, not an engineering one.

The one real bug found in that investigation (`next/image` `priority` not
emitting `fetchpriority="high"` under Next 16 + `cacheComponents`) was fixed in
PR #95.

## Pre-flight guard

A 404 page renders fast and would sail under every ceiling — a silently green run
measuring nothing. The PDP path is a **seed-fixture handle**
(`linen-shirt-k06tm2`) that a staging reseed can invalidate. The script therefore
asserts every page returns HTTP 200 before measuring, and refuses to run
otherwise. If a reseed changes the handle, update `cwv-budgets.json`.

## Why this is not a required CI check

It measures **deployed staging**, not the PR's code, so it cannot gate a PR —
a green run would only prove that whatever is currently on staging is fast, which
is unrelated to the diff under review. It is a scheduled/manual regression
detector, not a merge gate.

Wiring it as a scheduled workflow is a reasonable follow-up; it is left as a
documented manual script here because staging is redeployed by an explicit API
call rather than on every push, so there is no natural "after deploy" hook to
attach it to yet.
