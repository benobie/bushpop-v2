# bushpop-v2 — Bushpop Launch-1 Content Site

## What this repo is

`bushpop-v2` is the **Launch-1 static content site** for `bushpop.com.au` — a Next.js 16 + MDX app that replaces the WordPress site with a fast, SEO-preserving static export.

**This is NOT the marketplace.** The marketplace machinery (API, DB, Stripe, auth, workers) comes at Launch 2.

## Architecture

| Decision | Choice | Why |
|----------|--------|-----|
| Stack | Next.js 16, App Router, React 19, Tailwind v4, MDX | Same stack as Launch-2 marketplace — content pages graduate as routes, not a rewrite |
| Hosting | Cloudflare Pages, static export | Free, global CDN, same zone as bushpop.com.au |
| Output | `output: 'export'` (fully static, no Node runtime) | Best CWV for SEO-critical pages; Cloudflare Pages serves `out/` directly |
| Redirects | `apps/web/public/_redirects` ONLY | `next.config` `redirects()` are silently ignored under static export |
| Trailing slash | `trailingSlash: true` | Parity with WordPress URL contract; `/guides/size-charts/` → `out/guides/size-charts/index.html` |
| Content | MDX-in-repo, zero CMS | Git-versioned, zero attack surface, Ben authors/Claude commits |

## Locked architecture decisions

Full rationale: `~/projects/Bushpop/docs/architecture-decisions.md` (all six confirmed by Ben 16/06/2026).

## Monorepo structure

```
apps/web/       - Next.js 16 static content app (Launch 1 — CF Pages, static export)
apps/market/    - Marketplace SSR app (Launch 2 — piklo-v2 fork, flat routes, dev :3002)
packages/       - Engine: api (Fastify + workers), db (Drizzle), config, types, ui, api-client
infra/          - Engine compose: docker-compose.dev.yml (pg 5435 / redis 6380 / meili 7701),
                  docker-compose.engine.prod.yml (Coolify on homelab; web :3210, api :3334)
docs/engine/    - Curated upstream engine docs + FORK.md (provenance, pick recipe)
```

The engine was forked from `benobie/piklo-v2` @ `2419a38` (02/07/2026), renamed `@piklo/*` → `@bushpop/*`, single-tenant (only the `bushpop` channel exists; `CHANNEL_SLUG=bushpop`). **Read `docs/engine/FORK.md` before touching engine code** — notably the Stripe metadata keys (`piklo_payment_op_id` etc.) are deliberately NOT renamed (money-safety byte-parity with upstream) and must stay that way.

**Sell-flow backend SHIPPED 03/07 (PR #27, Phase 1 of `~/.claude/plans/build-brief-merry-garden.md`):** drafts façade (`routes/v1/seller/drafts/` — draft = inventory_items row, per-step PATCH, optimistic `version`), AI listing drafts (`lib/ai/` + `workers/ai-draft.ts` — Gemini 2.5 Flash-Lite primary, Haiku 4.5 escalation, worker gated on `GEMINI_API_KEY || ANTHROPIC_API_KEY`, writes ONLY `ai*` suggestion columns), image-variants worker (thumb-320/card-800/pdp-1600, always-on), shared strength v3 (`@bushpop/config` `computeListingStrength` — ONE rubric for drafts API/score worker/wizard, never fork it), publish gate (422 + `missing[]`), commission from `@bushpop/config` `COMMISSION_SCHEDULE` (1.75% + 30c — `channels.platform_fee_bps` is no longer consulted), migration `0023`. Gotcha for route authors: `@fastify/rate-limit` MUTATES the shared `preHandler` array — always build per-route arrays (see `drafts/routes.ts`).

**Sell wizard BUILT 04/07 (PR #48, Phase 2 of `~/.claude/plans/build-brief-merry-garden.md`):** the full `/sell` flow in `apps/market` — photos (compression/EXIF-strip/reorder/quality chips) → details (category/brand/size/colour/AI-assisted) → condition & measurements → price (live payout panel) → shipping → review/publish — backed by a Zustand draft-sync store (`lib/sell/store.ts`, single-flight debounced PATCH, optimistic updates, 409 dirty-wins conflict merge) against the drafts façade above. Publish gate mirrors the backend's `publishGateMissing()` client-side (Opus-verified byte-identical). Analytics wired through the existing PostHog `BushpopEvent` registry (`wizard.*` events), not GA4. Two dedicated Opus reviews (store engine, publish flow) plus a final whole-branch review, all APPROVE. 73 unit/RTL tests + 7 Playwright E2E tests against the real live app+API+Postgres stack (not mocks) — see `apps/market/e2e/sell-wizard.spec.ts`. Gotchas surfaced by running the E2E suite live rather than trusting mocks: the API dev server caches the `channels` table in memory at boot (`packages/api/src/plugins/channel.ts`) — reseeding after the server starts silently serves a fallback `channel_id: "unknown"` until restart; `publishDraft()` requires a `sellerProfiles` + `addresses` row (`assertListingActivationReady`), not just a `user_roles` grant. Next: multi-vendor / marketplace-wide features per the L2 direction (finish engine → single-seller → multi-vendor).

## Key constraints

- **Pure RSC** — no `"use client"` on content pages. Interactivity = isolated leaf client components only.
- **Trailing-slash parity** with WordPress (`trailingSlash: true`). This is load-bearing for SEO.
- **Content site stays static** — `apps/web` keeps `output: 'export'` + CF Pages; the engine (API, DB, Stripe, auth, workers) lives in `packages/*` + `apps/market` and deploys separately (Coolify). Never import engine packages from `apps/web`.
- **No `[channel]` routing** — Bushpop is single-tenant. Flat routes in both apps. The engine keeps channel *tables* (one seeded `bushpop` row) but no channel URL segments or hostname rewrites.
- **CI split** — `deploy.yml` = content site only (install, typecheck AND build are all `--filter @bushpop/web...` since PR #30 — engine packages are never installed in the content pipeline); `engine-ci.yml` = path-filtered engine gates (build/lint/typecheck/integration tests/webpack build/cache audit/security). An engine failure must never block a content deploy. Engine container builds: `R2_PUBLIC_URL` must be passed as a Docker build arg to `apps/market` (wired in the prod compose; PR #30) or listing images break.

## Next.js 16 gotchas (from piklo-v2 AGENTS.md)

- `proxy.ts` not `middleware.ts` for channel/proxy logic (N/A at Launch 1, but carry it forward)
- `next-env.d.ts` is gitignored — Next rewrites it between build/dev modes
- `tsconfig.json` `jsx` flips between `react-jsx` (build) and `preserve` (dev) — committed as `preserve`
- No `eslint` key in `NextConfig` (removed in Next 16). **NOTE: there is currently NO wired ESLint config** (no `eslint.config.*` at repo root or in `apps/web`; the `apps/web` `lint` script `eslint src` fails). CI gates are `pnpm typecheck` + `pnpm build`, NOT lint — rely on those.
- Turbopack is default for both `next dev` and `next build`
- `cacheComponents: true` is for the SSR/Launch-2 path — NOT set here (static export)
- **MDX plugins must be passed to `createMDX` as serializable string names, NOT imported functions** — Turbopack rejects function refs with "does not have serializable options". Use `remarkPlugins: [["remark-gfm"]]` / `rehypePlugins: [["rehype-slug"]]`. Both are wired: `remark-gfm` is load-bearing for pipe tables (without it MDX tables render as literal `|` text), `rehype-slug` gives headings `id`s for in-page anchor links (e.g. `/guides/size-charts/#condition-guide`)
- **`next/image` needs `images.unoptimized: true`** under `output: 'export'` (no optimisation server). Set in `next.config.ts`.
- **`lucide-react` is v1.x** — brand icons (Instagram/Facebook/YouTube/Twitter) were REMOVED. Inline minimal brand SVGs where needed (see `site-footer.tsx`).

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`) → `wrangler pages deploy out --project-name bushpop-v2`, run with `workingDirectory: apps/web`. **The `workingDirectory` is load-bearing, not cosmetic:** `wrangler pages deploy` resolves the Pages Functions directory (`functions/`) relative to its own cwd, not the output-dir argument — running it from repo root with `apps/web/out` as the arg silently never finds `apps/web/functions/`, so no Function ever deploys. This bit us for weeks (17/06–02/07): `functions/uncategorized/[[path]].js` was scaffolded and "done" but never actually served — fixed 02/07 (PR #20).

The deploy job only runs on `push` (`if: github.event_name == 'push'`) — **PRs get build/typecheck only, no preview deploy.** There is no per-PR live URL; the only way to see a change live pre-merge is to merge to `main` (staging) or run `pnpm build && wrangler pages deploy` locally against the same project.

CF Pages project: `bushpop-v2`
Staging URL: `bushpop-v2.pages.dev`

**Post-deploy verification (PR #36, 03/07):** the deploy job runs `apps/web/scripts/check-redirects.mjs` (59-row public-safe fixture) + `apps/web/scripts/post-deploy-check.mjs` (noindex polarity, security headers, sitemap/robots) against staging after every wrangler deploy; `.github/workflows/redirect-health.yml` repeats the fixture check daily. At cutover, flip `--base` in both to `https://bushpop.com.au` (marked `# TODO cutover`). Method doc: `apps/web/docs/redirect-verification.md`. The full 1,927-URL inventory, launch runbook, and monitoring plan are deliberately OUTSIDE this public repo (`~/projects/Bushpop/audit/` + `~/projects/Bushpop/docs/cutover/`); full inventory machine-verified 1,927/1,927 vs staging on 03/07. Gotcha: the 410 Pages Function only implements GET — HEAD returns 404; both scripts GET-fallback.

Production wiring (`bushpop.com.au` → Pages) is NOT this step — it's the cutover in MASTER-PLAN Phase 2. Pushing `main` deploys to **staging only**; production stays WordPress until the DNS cut (~9 Jul).

**Engine staging LIVE 03/07** — `market.bushpop.xyz` (web) + `api.bushpop.xyz` (api) via Coolify app `bushpop-engine` (uuid `w1be995ronuhl7092d4jr392`, deploy-key source, tracks `main`, base dir `/infra`, compose `/docker-compose.engine.prod.yml`). Deploys are API-triggered (`POST /api/v1/deploy?uuid=…`), NOT push-triggered. `/health/ready` all green (real Stripe test key; R2 bucket is **`bushpop-images`** + its r2.dev public URL — NOT `bushpop-media`); 6 fixtures seeded + Meili-indexed. Three gotchas fixed en route (PRs #41–#43): healthchecks must probe `127.0.0.1` not `localhost` (busybox wget resolves `::1`, meili binds IPv4-only); `validateEnv` treats `""` as unset (compose `${VAR:-}` injects empty strings); **Coolify resets any env whose compose default is non-empty to that default on EVERY deploy** — compose defaults must BE the real staging values, and Coolify-only overrides (e.g. `ADMIN_EMAIL`) will not stick. Seeding is manual (`docker exec <api> pnpm --filter @bushpop/db db:seed{,:categories}`) and does NOT index into Meili (search-sync is event-driven) — backfill by script if reseeding. `pk_test_` publishable key baked into the web bundle and Resend domain verified (both 03/07 — transactional email sends as `noreply@bushpop.com.au`). Outstanding: Stripe webhook secret is a placeholder until Phase 5; at cutover swap the two compose R2 defaults to `media.bushpop.com.au` + attach that custom domain to the bucket.

## Content authoring

Ben writes prose → Claude commits MDX → auto-deploy via CF Pages.

Content lives at: `apps/web/src/app/guides/`, `apps/web/src/app/shop/` etc.
MDX components: `apps/web/mdx-components.tsx` (wraps every page in `.prose-bushpop`).

## Design system (Launch-1)

The approved prototype (`~/projects/Bushpop/design/home/`) is ported and live on staging (#18, squash `b7f7160`).

- **Tokens** — `apps/web/src/app/globals.css` `@theme` block (ink/surface/green/red, radii, fonts) + component classes: glossy `.btn.green` Signature CTA, frosted `.nav`, `.pcard`, footer, marquee, `.prose-bushpop`. Green = accent only; red = sale only.
- **Fonts** — Hanken Grotesk + Inter via `next/font` in `layout.tsx` (licensed Roc Grotesk swap later).
- **Components** — `apps/web/src/components/`: wordmark, button, chip, product-card, site-nav, site-footer (RSC) + client leaves: fav-button, fresh-drops, waitlist-form, mobile-bottom-bar. Icons = `lucide-react`.
- **Coming-soon framing** — no marketplace yet, so every marketplace CTA routes to the `/shop` "Launching soon" storefront via `src/lib/links.ts` (`COMING_SOON`); homepage demo products (`src/lib/demo-products.ts`) are illustrative. Shop/product/sell/checkout are Launch-2.
- **Waitlist** — first-party capture live (F1, 03/07): `waitlist-form.tsx` POSTs same-origin to `/api/waitlist` (Pages Function → n8n → homelab `bushpop.waitlist`), success only on 2xx, `segment` prop per the F10 contract (`buyer`|`seller`|`opshop`). Secret `N8N_WAITLIST_WEBHOOK` on the CF Pages project (repo is public — never commit the webhook URL). Welcome email live (F11a, 04/07): n8n branches on `inserted=true` → Resend send, ledger-compliant buyer copy, no re-email on dedup. Full architecture + export path: `docs/waitlist.md`.
- **Trust claims** — site copy is governed by `docs/trust-claims-ledger.md` (W3 gate closed 03/07, PR #28): every removed fabricated claim + its exact reinstatement condition. No invented numbers, no fictional people/quotes, no unbuilt features described as current, numbers rendered from real data only. Check the ledger BEFORE adding any stat/social-proof/trust copy.

## Git workflow

Solo dev, auto-merge low-risk. Per `~/.claude/rules/git-workflow.md`.
Auto-merge + `delete_branch_on_merge=true` are enabled on `benobie/bushpop-v2`.
