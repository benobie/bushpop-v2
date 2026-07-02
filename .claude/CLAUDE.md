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

## Key constraints

- **Pure RSC** — no `"use client"` on content pages. Interactivity = isolated leaf client components only.
- **Trailing-slash parity** with WordPress (`trailingSlash: true`). This is load-bearing for SEO.
- **Content site stays static** — `apps/web` keeps `output: 'export'` + CF Pages; the engine (API, DB, Stripe, auth, workers) lives in `packages/*` + `apps/market` and deploys separately (Coolify). Never import engine packages from `apps/web`.
- **No `[channel]` routing** — Bushpop is single-tenant. Flat routes in both apps. The engine keeps channel *tables* (one seeded `bushpop` row) but no channel URL segments or hostname rewrites.
- **CI split** — `deploy.yml` = content site only (its typecheck is `--filter @bushpop/web`); `engine-ci.yml` = path-filtered engine gates (build/lint/typecheck/integration tests/webpack build/cache audit/security). An engine failure must never block a content deploy.

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

Production wiring (`bushpop.com.au` → Pages) is NOT this step — it's the cutover in MASTER-PLAN Phase 2. Pushing `main` deploys to **staging only**; production stays WordPress until the DNS cut (~9 Jul).

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
- **Waitlist** — `waitlist-form.tsx` POSTs to `NEXT_PUBLIC_WAITLIST_ENDPOINT` (UNSET → optimistic success). Wire a real endpoint (CF Pages Function or form service) to actually capture emails.

## Git workflow

Solo dev, auto-merge low-risk. Per `~/.claude/rules/git-workflow.md`.
Auto-merge + `delete_branch_on_merge=true` are enabled on `benobie/bushpop-v2`.
