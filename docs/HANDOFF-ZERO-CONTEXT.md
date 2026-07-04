# bushpop-v2 — ZERO-CONTEXT DEV HANDOFF

**Written:** 04/07/2026 · **Status:** LIVING DOCUMENT — append, don't rewrite history
**Audience:** any AI (or human) joining this repo with zero prior context. Read top to bottom once, then work.
**Scope:** the code — architecture, money path, tests/CI, deployment, debt, cutover machinery. No credentials or secret values live in this doc (env var NAMES only).

> **This is the DEV layer of a three-doc family** — link to the siblings, never duplicate them:
> - **Business:** `~/projects/Bushpop/docs/HANDOFF-ZERO-CONTEXT.md` — orientation, history, decision ledger, sequencing, legal. Business-level decisions (fees, claims, launch scope) canonically live in its §4.
> - **Design:** `~/projects/Bushpop/design/HANDOFF-ZERO-CONTEXT.md` — design system, homepage/prototype state, locked visual rules.
> - **Dev (this doc):** in-repo so it's versioned. When you learn something that changes a section, append a dated entry under §11 rather than silently rewriting history; small factual corrections in §§1–8 are fine if you log them in §11.

---

## 1. What this repo is

Bushpop is an Australian secondhand fashion marketplace (bushpop.com.au) being rebuilt from scratch after its WordPress v1 failed operationally — the business doc covers all of the why. This repo (`benobie/bushpop-v2`) holds both halves of the rebuild:

1. **`apps/web` — the Launch-1 content/SEO site.** Next.js 16 + MDX, static export, live on Cloudflare Pages staging (https://bushpop-v2.pages.dev). Carries the SEO assets (size charts, op-shop guides) ahead of the DNS cutover of bushpop.com.au.
2. **The marketplace engine — Launch 2.** A copy-and-own fork of the sibling `piklo-v2` engine (see §2 Fork provenance): `packages/*` + `apps/market`, single-tenant, own CI, own staging (market.bushpop.xyz + api.bushpop.xyz).

What does NOT live here: business/strategy docs, design prototypes, audits, and the cutover runbook — those live in the (non-git) workspace `~/projects/Bushpop/` (notably `docs/cutover/` and `audit/` there, **not** in this repo — see §8).

## 2. Architecture

### Monorepo map (pnpm workspaces: `apps/*`, `packages/*`)

| Path | Package | What it is |
|---|---|---|
| `apps/web` | `@bushpop/web` | Launch-1 content site. Next 16 + MDX, `output:'export'`, pure static + Pages Functions. Dev port 3000. No engine imports. |
| `apps/market` | `@bushpop/market` | Marketplace storefront. Next 16 SSR (React 19), better-auth, Stripe Elements, PostHog. Dev port 3002. |
| `packages/api` | `@bushpop/api` | The engine: Fastify v5 API **plus all background workers in-process** (no separate worker app). Entry `packages/api/src/index.ts` — validates env, builds server, `startWorkers()`, listens on 3333. |
| `packages/db` | `@bushpop/db` | Drizzle schema (15 modules under `src/schema/`), client, migrations (`drizzle/`), seeds. |
| `packages/api-client` | `@bushpop/api-client` | TS client generated from the API's OpenAPI spec (`openapi-fetch`); consumed by `apps/market`. |
| `packages/config` | `@bushpop/config` | Shared constants + Zod env schema: `env.ts`, `fees.ts`, `parcels.ts`, `listing-strength.ts`, `ai.ts`, `channel.ts`, taxonomy, prohibited terms. **Money maths starts here.** |
| `packages/types` | `@bushpop/types` | Shared Zod/TS types. |
| `packages/ui` | `@bushpop/ui` | Design system (Radix + CVA + Tailwind v4). |
| `services/support-order-context` | (not a workspace) | Thin Chatwoot dashboard app showing a buyer's WooCommerce order history — support tooling for the v1 site. Zero deps. |
| `infra/` | (not a workspace) | `docker-compose.dev.yml` (local Postgres/Redis/Meili) + `docker-compose.engine.prod.yml` (staging/prod engine stack). |

Stack: Node ≥22, pnpm 10.8.1, TypeScript ^5.7, Turborepo. Engine: Fastify ^5, Drizzle ~0.45, BullMQ ^5 (Redis/ioredis), MeiliSearch, Resend, Stripe (SDK pinned `22.0.0` via root `pnpm.overrides`, alongside `ioredis 5.10.1` — money-safety pins), better-auth, AWS S3 SDK (R2), `@google/genai` + `@anthropic-ai/sdk`, Sharp.

### Database topology

- **Postgres 16.** Dev via `infra/docker-compose.dev.yml`: Postgres on host port **5435**, Redis **6380**, MeiliSearch **7701** (chosen to clear life-dashboard on 5433 and piklo on 5434 — see the comment at `.github/workflows/engine-ci.yml:106`).
- **Test DB is `bushpop_test`** on the same 5435 instance. `packages/api/src/test/setup.ts` refuses to run unless `DATABASE_URL` contains `bushpop_test`, and TRUNCATEs user-data tables between tests. ⚠️ Fork-copied docs (`docs/engine/EDGE-CASES.md`, `ONBOARDING.md`, `ARCHITECTURE.md`) still say port 5433 / `piklo_test` — they are stale; this doc and `vitest.config.ts` are right.
- **Migrations:** `packages/db/drizzle/` — 24 files, `0000`–`0023`. `0000`–`0022` are **verbatim upstream piklo-v2**; fork-local migrations start at `0023_melted_havok.sql` (sell-flow: `ai_generations` table, `inventory_items` pricing/measurement/shipping columns, `listing_scores.breakdown`). Append from `0024`.
- **Prod compose** (`infra/docker-compose.engine.prod.yml`): pg/redis/meili internal-only; api published `3334:3333`, web `3210:3000`.

### Workers (all in-process with the API)

`packages/api/src/workers/index.ts` `startWorkers()` starts ~17 BullMQ workers (skipped when `NODE_ENV==="test"`): image-variants, image-cleanup, ai-draft (gated on `GEMINI_API_KEY`/`ANTHROPIC_API_KEY`), enrichment (gated on `ANTHROPIC_API_KEY`), checkout-expiry, shipping-label, email, event-consumer, search-sync, listing-score, notification-sweeper, refund, starshipit-poll, reconcile-indeterminate-ops, order-jobs-sweeper, backfill-aspect-ratios, and **payout-release — gated OFF by default** (§3). Inventory doc: `docs/engine/workers.md`.

### External integrations (wiring files)

| Service | Wired at |
|---|---|
| MeiliSearch | `packages/api/src/lib/meilisearch.ts`, `lib/search-index.ts` (index name is still `listings_piklo` — §7) |
| Cloudflare R2 | `packages/api/src/lib/r2.ts`, `lib/image-url.ts` — staging bucket `bushpop-images` (NOT `bushpop-media`) |
| Resend (email) | `packages/api/src/lib/email/resend.ts` (+ `mock.ts`); sends as `noreply@bushpop.com.au` |
| Stripe | `packages/api/src/lib/stripe.ts`; webhook `routes/v1/webhooks/stripe.ts`; payouts `lib/payout-hold-service.ts` |
| AI (listing drafts) | `packages/api/src/lib/ai/provider.ts` → `gemini.ts` (primary, Gemini 2.5 Flash-Lite) / `anthropic.ts` (escalation, Claude Haiku 4.5); config `packages/config/src/ai.ts` |
| Starshipit (shipping) | `packages/api/src/lib/shipping/starshipit.ts` (AusPost carrier), mock fallback in `lib/shipping/index.ts` |

### Fork provenance

The engine is a `git archive` copy of `benobie/piklo-v2` @ **`2419a38`** (02/07/2026) with fresh history — full recipe and rename table in `docs/engine/FORK.md`. `@piklo/*` → `@bushpop/*` across 172 files; single-tenant `bushpop` channel (`platformFeeBps: 175`); `apps/admin` + `apps/mobile` pruned. **Deliberately NOT renamed (money byte-parity):** Stripe metadata keys `piklo_payment_op_id` / `piklo_order_id` / `piklo_refund_id` / `piklo_checkout_session_id` — these are functional identifiers, do not "fix" them (§7). The 16 `docs/engine/*.md` files are curated upstream docs, each headed with a provenance blockquote.

## 3. The money path — as it exists today

Every step below is cited against code as at `main` 04/07/2026 (post-PR #27). This is what IS, not what's planned.

**1. Draft → publish.** Sellers build listings through the drafts API (`packages/api/src/routes/v1/seller/drafts/routes.ts`: create :52, per-step PATCHes :97-155, images :159-192, publish :196). Publish is server-gated by `publishGateMissing()` (`.../drafts/publish-service.ts:63-100`) — a **required-fields checklist** (photos, title, category, size unless exempt, condition, price>0, shipping, parcel, `legal_agree`), plus a prepaid-economics check (:85-95): for prepaid shipping, `price − fee − label` must be positive or publish 422s with `price_too_low`. ⚠️ **Correction to other docs:** the listing-strength score does **not** gate publish — it's computed *after* the gate (`publish-service.ts:197`, rubric in `packages/config/src/listing-strength.ts`) and used only for event metadata + the seller email. The business doc's glossary says otherwise; the code wins.

**2. AI listing drafts (confirm-not-commit).** `packages/config/src/ai.ts` sets Gemini 2.5 Flash-Lite primary, Claude Haiku 4.5 escalation (on throw, schema-fail, or confidence < 0.4 — `packages/api/src/workers/ai-draft.ts:38-85`). The worker writes **only `ai*` suggestion columns**, never canonical fields (`ai-draft.ts:120-137`); the seller confirms suggestions via normal PATCHes, and at publish `recordAiOutcome` diffs kept-vs-edited per field (`publish-service.ts:107-144`).

**3. Checkout → PaymentIntent.** The live storefront (`apps/market/src/components/checkout/checkout-flow.tsx:73`) posts to `/api/v1/store/checkout` → `initiateCheckout()` (`packages/api/src/routes/v1/store/checkout/service.ts`). DB-before-Stripe: reserve inventory + insert `checkout_sessions` row, then `stripe.paymentIntents.create({ amount: totals.totalCents, transfer_group, metadata }, { idempotencyKey: sessionId })` at **:287-302** — a **plain charge into the platform account**: no `transfer_data.destination`, no `application_fee_amount`. Bushpop is merchant-of-record at charge time.

**4. Where the live trace stops.** There is no placeholder-key short-circuit in production code — with an unset/placeholder `STRIPE_SECRET_KEY` the trace dies at the real Stripe call (`checkout/service.ts:287`; error path :310-320 → session `failed`, inventory released, 502 `STRIPE_ERROR`). Engine staging has a **real Stripe test key**, so the PI leg works there; but `STRIPE_WEBHOOK_SECRET` on staging is a placeholder until Phase 5, so **the webhook→order leg is the current end of the verified live trace**.

**5. "Direct mode".** The Phase-1 direct-mode *flag* from the roadmap does **not exist in code** — no `PAYMENTS_MODE`/`directMode` anywhere. The live `/checkout` path already *behaves* as direct/MoR (step 3). A second, **unwired** path exists (`/checkout-groups`, `routes/v1/store/checkout-groups/service.ts`) that branches by seller count (`:252` — 1 seller = Stripe destination charge, >1 = separate charges & transfers); the storefront does not call it. Building "direct mode" is therefore a formalisation task, not a flag flip.

**6. Webhook → order.** `routes/v1/webhooks/stripe.ts` (signature-verified raw body :76, dedup + dead-letter :84-98) handles `payment_intent.succeeded/requires_action/payment_failed`, refund events, `transfer.updated`, `account.updated` (:104-165). Order creation linearises on the `orders` INSERT with `onConflictDoNothing({ target: checkoutSessionId })` (:450-468); the insert winner marks inventory sold, writes `order_items`, **inserts a `payout_holds` row** (`amountCents = sellerProceedsCents`, status `held`/`blocked` :516-533), then enqueues order jobs (:718-737).

**7. Emails.** Resend via the email worker (`packages/api/src/workers/email.ts`, 3 attempts/backoff). Eight types in `packages/api/src/lib/email/templates.ts`: buyer order confirmation, seller order notification, buyer shipping confirmation, tracking-exception admin alert, score nudge, report actioned/reinstated, listing published. Sender name is the dynamic channel name — resolves to "Bushpop" (`packages/config/src/channel.ts`); **no "Piklo" strings in any customer-facing email**.

**8. Shipping label.** Order jobs enqueue `workers/shipping-label.ts` → provider `createShipment` → Starshipit (AusPost) when `STARSHIPIT_API_KEY` is set, else a mock (`lib/shipping/index.ts:16-29`). Label **cost** is not fetched live — deductions use static `PARCELS` estimates (`packages/config/src/parcels.ts:21-25`: small 855¢, medium 1095¢, large 1660¢; live AusPost rates explicitly out of scope day 1).

**9. Commission + payout (verified maths).** `packages/config/src/fees.ts`: `COMMISSION_SCHEDULE = [{ effectiveFrom: "2026-07-01", bps: 175, fixedCents: 30 }]` (:22-24) — **1.75% + 30¢**, seller-side. `calcFeeCents = round(price × 175/10000) + 30` (:41-47); `calcPayoutCents = price − fee − prepaidLabel` (:54-61); order-level equivalents in `packages/api/src/lib/order-totals.ts` (`sellerProceedsCents = totalCents − platformFeeCents − prepaidLabelCents`, :74). **Worked example from the constants:** $200 sale + Medium prepaid label → fee = round(20000×175/10000)+30 = 380¢; payout = 20000 − 380 − 1095 = **18525¢ = $185.25 exactly** (asserted in the `fees.ts` docstrings and `packages/api/src/test/unit/fees.test.ts`). Buyer pays `subtotal + shipping` only (`order-totals.ts:73`).

**10. Payout release (gated OFF).** Holds release via `releasePayoutHold()` (`lib/payout-hold-service.ts`) → `stripe.transfers.create` to the seller's Connect Express account (idempotency key per attempt, advisory lock, list-first-after-5xx). Scheduled every 30 min by `workers/payout-release.ts`, but the worker only starts when `PAYOUT_RELEASE_ENABLED=true`, with a live-key guard requiring `PAYOUT_RELEASE_ALLOW_LIVE=true` for `sk_live_` keys (`workers/index.ts:92-104`). Manual release: `POST /api/v1/admin/payouts/:holdId/release`.

### ⚠️ The 7% Buyer Protection fee — code vs copy conflict

The engine implements **no buyer protection fee at all**: the buyer's charged total is `subtotalCents + shippingCents` (`order-totals.ts:73`), and no BP constant/line-item exists in `fees.ts`, checkout, or checkout-groups. But the **shipped content-site copy** says the opposite — buyer-side 7% added at checkout (`apps/web/src/app/page.tsx:63` "Buyers pay the item price plus a 7% Buyer Protection fee at checkout", `:69` "added at checkout"; also `about/how-it-works/page.mdx:65`, `about/buying`, `about/selling`, guides). Worse, `page.tsx:68` claims "**no seller commission**", contradicting the engine's 1.75% + 30¢. The web copy appears to predate the 03/07 fee ratification ("no buyer fees, ever"). **Which side pays the BP fee — and whether it exists at all — is an unresolved BUSINESS decision** (business doc §4); until it's made, don't implement the fee and don't propagate the web copy's fee claims anywhere.

## 4. Test & CI state

- **API suite** (`packages/api`): Vitest 4, `fileParallelism: false`, 59 test files (unit in `src/test/unit/`, 47 integration suites in `src/test/integration/`, plus route/lib-colocated). Needs **real Postgres + Redis + MeiliSearch** (`vitest.config.ts` points at `…:5435/bushpop_test`, `:6380`, `:7701` — start `infra/docker-compose.dev.yml` first). **568 passing tests recorded at the PR #27 merge (03/07)**; that number isn't asserted anywhere in-repo, so re-derive from a live run if you need it authoritative.
- **Market tests exist only in open PR #48** (73 unit/RTL + 7 real-stack Playwright E2E, adds vitest/RTL/MSW/Playwright tooling). On `main`, `apps/market` has no test script yet.
- **CI — 3 workflows** (`.github/workflows/`):
  - `deploy.yml` ("CI + Deploy") — push + PR, **no path filter**: Build job (content site only, `--filter @bushpop/web...`); Deploy job push-only → CF Pages + post-deploy checks. **PRs get no preview deploy.**
  - `engine-ci.yml` ("Engine CI") — path-filtered to engine paths: Build, Lint, Type Check, Integration Tests (service containers: pg/redis/meili, migrate + seed, full API suite), Market Build (webpack), Cache Audit, Security (`pnpm audit --audit-level=critical` + gitleaks).
  - `redirect-health.yml` — daily 22:00 UTC fixture check against staging (§8).
- ⚠️ **`main` has no branch protection** — zero required checks (`gh api .../branches/main/protection` → 404). Green CI before merge is solo-dev convention, not enforcement. Don't assume a red PR can't merge.

## 5. Deployment topology

- **Content site → Cloudflare Pages**, project `bushpop-v2`, staging https://bushpop-v2.pages.dev. Deployed by `deploy.yml` running `wrangler pages deploy out --project-name bushpop-v2` with `workingDirectory: apps/web` — **load-bearing**: wrangler resolves `functions/` relative to its own cwd; run from repo root and the Pages Functions silently vanish (this hid the 410 Function for weeks; fixed PR #20). Production bushpop.com.au stays on WordPress until the DNS cutover.
- **Engine staging — LIVE since 03/07**: `market.bushpop.xyz` (web) + `api.bushpop.xyz` (API) via Coolify app `bushpop-engine` on the homelab VPS, base dir `/infra`, compose `docker-compose.engine.prod.yml`. Deploys are **API-triggered via Coolify** (`POST /api/v1/deploy?uuid=…`) — nothing in GitHub Actions ships the engine. Gotchas (all documented in `.claude/CLAUDE.md` §Deploy): Coolify **resets any env var whose compose default is non-empty back to that default on every deploy** (hence compose defaults = real staging values, PR #43); healthchecks must probe `127.0.0.1` not `localhost` (PR #41); `validateEnv` treats `""` as unset (PR #42); seeding is manual and doesn't Meili-index.
- **Env/secrets surface (NAMES only — values live in Coolify / CF / GitHub secrets):**
  - Engine API (Zod schema, `packages/config/src/env.ts` — authoritative): required `DATABASE_URL`, `REDIS_URL`, `MEILISEARCH_HOST`, `MEILI_MASTER_KEY`, `BETTER_AUTH_SECRET`, `WEB_URL`, `ADMIN_URL`, `API_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STARSHIPIT_API_KEY`, `STARSHIPIT_WEBHOOK_SECRET`; optional `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET_NAME`/`R2_PUBLIC_URL` (effectively required for the storefront), `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_EMAIL`, `STARSHIPIT_SUBSCRIPTION_KEY`, `SENTRY_DSN`; defaults `NODE_ENV`, `API_HOST`, `API_PORT`, `CHANNEL_SLUG`.
  - Market app: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `API_BASE_URL` (NEXT_PUBLIC_* are build-time Docker ARGs), `PAYOUT_RELEASE_ENABLED`, `PAYOUT_RELEASE_ALLOW_LIVE`.
  - Compose extras: `BUSHPOP_DB_PASSWORD`, `POSTGRES_DB/USER/PASSWORD`, `MEILI_ENV`, `MEILI_NO_ANALYTICS`.
  - Content site / CF Pages: `N8N_WAITLIST_WEBHOOK` (Pages secret), `NEXT_PUBLIC_WAITLIST_ENDPOINT`; CI: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
  - `services/support-order-context`: `ORDER_CONTEXT_TOKEN`, `PORT`, `WC_BASE_URL`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`.

## 6. Open PRs + gates (as at 04/07/2026)

- **PR #48 — `feat(market): Phase 2 sell wizard`** (branch `feat/phase-2-sell-wizard`). The full photos→details→condition→price→shipping→review sell flow, Zustand draft-sync against the drafts API, AI-assisted drafts, shared listing-strength rubric, publish gate wiring; brings the market test tooling (73 RTL + 7 Playwright E2E). State: MERGEABLE / CLEAN, **all CI checks green** (Deploy skipped — expected on PRs). **Merge is deliberately HELD for human sign-off — do NOT auto-merge** (money/launch-critical per the operating model in the business doc §9). Post-merge gates, both human-only: (1) real-device mobile-Safari pass, (2) staging AI live-smoke test.
- No other open PRs.

## 7. Known debt / de-hardcode register (branding)

The `@piklo/*` → `@bushpop/*` package rename is complete, and **customer-facing surfaces are clean** (emails render "Bushpop" via the channel config). The remaining "Piklo" footprint, by disposition:

| Item | Where | Disposition |
|---|---|---|
| Stripe metadata keys `piklo_payment_op_id`, `piklo_order_id`, `piklo_refund_id`, `piklo_checkout_session_id`, `piklo_reason` | `lib/refund-service.ts`, `lib/payout-hold-service.ts:633`, `workers/payout-release.ts`, `workers/reconcile-indeterminate-ops.ts`, `routes/v1/webhooks/stripe.ts` (`readPikloOpId`), `checkout/service.ts:610` | **MUST STAY** — functional reconciliation identifiers, byte-parity with Stripe objects (FORK.md §6). Renaming = a Stripe-data migration, not find/replace. |
| MeiliSearch index name `listings_piklo` | `packages/api/docker-entrypoint.sh`, search wiring | **Data migration required** — reindex under a new name + cutover, not a rename. Low urgency. |
| Stale fork-copied docs | `docs/engine/OPS-RUNBOOK.md` (entire deploy section describes upstream piklo infra — contradicts the live Coolify reality), `ARCHITECTURE.md` (piklo channel @8% examples, `DEFAULT_CHANNEL "piklo"`, `media.piklo.com.au`), `EDGE-CASES.md` (`piklo_test`/5433), `ONBOARDING.md` (5433), `workers.md` (`admin@piklo.com.au` claim — code default is `admin@bushpop.com.au`) | **Safe to rewrite** — docs-only sweep, no code risk. Highest-value item: OPS-RUNBOOK. |
| Provenance-header typo | Every `docs/engine/*.md` header reads "with `@bushpop/*` renamed `@bushpop/*`" (should be "`@piklo/*` renamed `@bushpop/*`") | **Safe to fix** — one find/replace across the headers. |
| Cosmetic comments/Dockerfile headers | `checkout/service.ts:580` ("Piklo uses Stripe Connect destination charges" — true only of the unwired checkout-groups path), `apps/market/src/lib/format-money.ts:3`, `packages/api/Dockerfile:1`, `apps/market/Dockerfile:1`, `packages/{ui,api-client}/README.md`, `infra/docker-compose.engine.prod.yml:4`, `packages/db/drizzle/0018_….sql:6` | **Safe to fix** whenever touching those files; zero user impact. |

There is no separate de-hardcode plan doc — **this table is the register**; tick items off via §11 entries.

## 8. Cutover machinery (content-site → bushpop.com.au)

- **The live redirect contract is in this repo:** `apps/web/public/_redirects` (69 active rules; 75×301, 1×302, 10×410-fallback, 4×200 serve-guards) + the Pages Function `apps/web/functions/uncategorized/[[path]].js` (real HTTP 410 for the WP-era spam URLs — CF Pages has no native 410 in `_redirects`). Rules are first-match; the file header documents the **CF Pages ~130–186 rule silent-drop limit** that caused the 30/06 P0 (56 category 404s). ⚠️ The 410 Function is **GET-only — HEAD returns 404**; both check scripts GET-fallback for this.
- **Trap:** `~/projects/Bushpop/audit/redirect-map.csv` + `audit/cloudflare/` are **STALE — do not regenerate or trust them**; re-running `build_redirect_map.py` would regress the 29/06 no-410/dedup decisions. This repo's `_redirects` + Pages Function are canonical.
- **Verification tooling** (`apps/web/scripts/`): `check-redirects.mjs` (verifies status/location per URL without auto-following; `--fixture` mode = `fixtures/redirect-fixture.csv`, 59 rows, runs post-deploy in `deploy.yml`; `--inventory` mode = the full 1,927-URL GSC inventory, machine-verified 1,927/1,927 on 03/07) and `post-deploy-check.mjs` (noindex/security-headers/sitemap hygiene). `redirect-health.yml` re-runs the fixture daily against staging; its `--base` flips to `https://bushpop.com.au` at T+24h post-cutover.
- **The runbook lives OUTSIDE this repo**: `~/projects/Bushpop/docs/cutover/` (launch-runbook.md, monitoring-plan.md, risks.md, GSC baselines) and the URL inventory in `~/projects/Bushpop/audit/`. (The business doc's §11 table says `bushpop-v2/docs/cutover/` — that path doesn't exist; corrected here and flagged in its amendments log.)

## 9. Decisions register (dev-level; business decisions live in the business doc §4)

| Date | Decision | Author | Evidence |
|---|---|---|---|
| 02/07/2026 | Fork = `git archive` copy of piklo-v2 @ `2419a38`, fresh history, single-tenant `bushpop` channel; keep `piklo_*` Stripe metadata keys for money byte-parity | Ben + Claude (fork session) | `docs/engine/FORK.md` |
| 02/07/2026 | Root pnpm overrides pin `stripe 22.0.0` + `ioredis 5.10.1` (money-safety) | Claude (fork session) | root `package.json` |
| 03/07/2026 | Commission cutover to 1.75% + 30¢ with prepaid-label payout deduction; effective-dated `COMMISSION_SCHEDULE` (append-only) | Ben (ratified), PR #27 | `packages/config/src/fees.ts` |
| 03/07/2026 | Publish gate = required-fields checklist incl. prepaid `price_too_low` economics; listing strength stays advisory | PR #27 cross-model review (task 9) | `publish-service.ts:83-95` |
| 03/07/2026 | AI drafts: confirm-not-commit (suggestions never write canonical fields); Gemini primary, Haiku escalation, no queue retries | PR #27 | `packages/config/src/ai.ts`, `workers/ai-draft.ts` |
| 03/07/2026 | Payout-release worker ships gated OFF (`PAYOUT_RELEASE_ENABLED`) with an sk_live_ guard | PR #27 | `workers/index.ts:92-104` |
| 03/07/2026 | Engine staging on Coolify with API-triggered deploys; compose env defaults = real staging values (Coolify clobbers stored envs on deploy) | Claude (staging session), PRs #41–#43 | `.claude/CLAUDE.md` §Deploy |
| 03/07/2026 | Post-deploy redirect verification in CI + daily `redirect-health.yml`; fixture-based smoke on every deploy | PR #36 | `apps/web/scripts/` |
| 04/07/2026 | PR #48 (sell wizard) merge held for human sign-off; post-merge gates = real-device Safari + staging AI smoke | Ben (operating model) | business doc §3/§9 |
| 04/07/2026 | This doc created as the dev layer of the three-doc zero-context family | Claude Code (Fable 5) | this file, §11 |

## 10. Continue-here queue (priority order)

1. **Merge PR #48** after Ben/Fable sign-off, then run its two post-merge gates (real-device mobile-Safari, staging AI live-smoke) — merging also lands the market test tooling on `main`.
2. **Payment trace past the PI:** set a real `STRIPE_WEBHOOK_SECRET` on staging (Phase 5) and verify the webhook→order→emails→label leg end-to-end with Stripe test cards.
3. **Formalise Phase-1 direct mode** — decide whether the implicit MoR behaviour of `/checkout` needs a named flag/config, and what to do with the unwired `/checkout-groups` path (keep for Phase 2 multi-vendor).
4. **BP-fee decision (BLOCKED on business call)** — resolve the §3 code-vs-copy conflict (7% buyer fee + "no seller commission" claims in `apps/web` vs engine reality + ratified positioning), then fix the web copy or the engine, not both independently.
5. **De-Piklo docs sweep** — §7 "safe to rewrite/fix" rows: OPS-RUNBOOK rewrite against the real Coolify deploy, 5433→5435 corrections, provenance-header typo.
6. **Test-count reconciliation** — run the API suite against a live dev stack and record the real count in §4 (replaces the "568 as recorded" phrasing).
7. **Multi-vendor (Phase 2)** per the L2 roadmap (`~/projects/Bushpop/docs/launch-roadmap-2026-07-01.md`) — order/payout work + moderation queue; `/checkout-groups` and Connect onboarding code already exist as starting points.

## 11. Session contributions (append-only)

Future Claude Code / AI sessions: **append** an entry here — author-tagged (account + model + date). Never rewrite or delete someone else's entry. If your work changes facts in §§1–8, correct them in place AND note the correction in your entry. Business-level decisions you uncover belong in the business doc's §4 — flag them here as "PROMOTE → business doc", don't decide them.

**Template:**

```markdown
### DD/MM/YYYY — <author account> · <model> · <session focus>
- What changed: …
- Facts corrected in §§1–8: … (or "none")
- PROMOTE → business doc: … (or "none")
- Queue items added/closed (§10): …
```

### 04/07/2026 — Ben's account (bobrien9@gmail.com) · Claude Code (Fable 5) · dev-layer handoff creation
- What changed: created this document (§§1–11) as the dev layer of the three-doc zero-context family; all §3 money claims verified against code (commission constants, $200→$185.25 worked example, publish gate, payout gating); filled the business doc's "Engine & repo detail" section with a 1-page summary linking here.
- Facts corrected in §§1–8 (vs what other docs claim): (a) listing strength does NOT gate publish — required-fields checklist does (`publish-service.ts:63-100`); (b) the Phase-1 "direct mode" flag does not exist in code — the live `/checkout` path is already implicitly MoR; (c) test env is Postgres 5435/`bushpop_test`, not the 5433/`piklo_test` in stale engine docs; (d) cutover runbook lives at `~/projects/Bushpop/docs/cutover/`, not `bushpop-v2/docs/cutover/`; (e) "568/568" tests is a PR #27-recorded figure, not asserted in-repo (59 test files on `main`).
- PROMOTE → business doc: (1) **the 7% Buyer Protection fee conflict** — engine implements no BP fee (`order-totals.ts:73`), shipped `apps/web` copy claims buyer-side 7% at checkout AND "no seller commission" (`page.tsx:63,68-69` + about/guides MDX), both contradicting the ratified 1.75%+30¢-seller-side / no-buyer-fees positioning — needs a §4 decision before any fee copy or fee code ships; (2) the business doc glossary's "Listing strength — …score gating publish" line is wrong per (a); (3) `main` has no branch protection — whether to add required checks before more money-path merges is an operating-model call.
- Queue items added/closed (§10): seeded the initial queue (7 items); none closed.

### 04/07/2026 — Ben's account (bobrien9@gmail.com) · Claude Fable 5 (Cowork) · pre-share final review of the three-doc family
- What changed: nothing in this doc — reviewed all three zero-context handoffs before Ben shares them with a second AI account. This doc's facts verified as the freshest of the three (created 04/07, code-cited).
- Facts corrected in §§1–8: none here. The "pending owner sweep" items from the previous entry were applied to the **business doc** this session (its §3 + §11 cutover path → `~/projects/Bushpop/docs/cutover/`, path verified on disk; §12 listing-strength glossary corrected). Design doc §1 clarified: Launch 1 is staging-live, cutover pending.
- PROMOTE → business doc: none new. Of the previous entry's three: (1) BP-fee conflict — already tracked (business §12 ⚠️ + task 8ecbbbcf); (2) glossary — fixed this session; (3) branch protection on `main` — now explicitly logged as an open Ben decision in the business doc's amendments log.
- Queue items added/closed (§10): none.

### 04/07/2026 — ben@bushpop.com.au / Claude Fable 5 (Claude Code) · §10 queue review + AFK fleet planning
- What changed: reviewed all 7 §10 items against live state (PR #48 CI all-green re-verified; prod compose `${STRIPE_WEBHOOK_SECRET}` confirmed default-less, so a Coolify-stored value survives deploys). Composed and authored a 5-session AFK fleet (`~/.claude/handoffs/2026-07-04-bushpop-q10-*.md` + launcher): A = item 5 de-Piklo docs sweep 🟢, B = item 6 test-count reconciliation 🟢, C = item 3 direct-mode decision memo 🟢 (docs-only; any checkout-groups gating is a Ben-gated follow-up), D = item 2 payment trace 🔴 (blocked-start on Ben's Stripe-dashboard + Coolify webhook-secret steps, then autonomous), E = item 4 Fee Model D implementation 🟡 (wrapper over `~/projects/Bushpop/docs/handoffs/HANDOFF-fee-model-D-implementation-2026-07-04.md`; Codex/Sonnet build, Opus deep review on the money path, cross-model mandatory, **merge HELD for Ben — never auto-merge**).
- Facts corrected in §§1–8: none. The §3 ⚠️ BP-fee code-vs-copy warning STANDS until session E's PR merges — but its status changed: **Fee Model D was DECIDED by Ben 04/07** (task `8ecbbbcf`; seller 1.75% + 30¢ unchanged; buyer BP fee 4% of item subtotal + 50¢ posted / $0 pickup, no cap, no promo; decision authority business doc §4). E's §11 entry closes the warning when the code + copy land.
- PROMOTE → business doc: none — Model D is already ledgered in business §4; item 1's merge + two human gates and the pickup handover-photo $-threshold (~$100 anchor) remain open Ben actions.
- Queue items added/closed (§10): none closed yet — items 2/3/5/6 dispatched as fleet sessions D/C/A/B; item 4 unblocked (DECIDED) and dispatched as session E; item 1 stays Ben-only; item 7 needs its own planning session.
