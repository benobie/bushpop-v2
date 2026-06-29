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
apps/web/       - Next.js 16 static content app (Launch 1)
                  Launch 2 adds packages/* forked from piklo-v2
```

The monorepo skeleton (pnpm workspaces + Turborepo) exists now even though only `apps/web` is populated. At Launch 2, `packages/api`, `packages/db`, etc. are forked from `piklo-v2` into this repo. Content MDX routes survive the graduation untouched.

## Key constraints

- **Pure RSC** — no `"use client"` on content pages. Interactivity = isolated leaf client components only.
- **Trailing-slash parity** with WordPress (`trailingSlash: true`). This is load-bearing for SEO.
- **No marketplace machinery** at Launch 1. Resist: API, DB, Stripe, auth, workers, `packages/api`.
- **No `[channel]` routing** — Bushpop is single-tenant. Flat routes: `app/guides/`, `app/shop/`, etc.

## Next.js 16 gotchas (from piklo-v2 AGENTS.md)

- `proxy.ts` not `middleware.ts` for channel/proxy logic (N/A at Launch 1, but carry it forward)
- `next-env.d.ts` is gitignored — Next rewrites it between build/dev modes
- `tsconfig.json` `jsx` flips between `react-jsx` (build) and `preserve` (dev) — committed as `preserve`
- No `eslint` key in `NextConfig` (removed in Next 16) — ESLint lives in root `eslint.config.mjs`
- Turbopack is default for both `next dev` and `next build`
- `cacheComponents: true` is for the SSR/Launch-2 path — NOT set here (static export)
- **MDX plugins must be passed to `createMDX` as serializable string names, NOT imported functions** — Turbopack rejects function refs with "does not have serializable options". Use `remarkPlugins: [["remark-gfm"]]` / `rehypePlugins: [["rehype-slug"]]`. Both are wired: `remark-gfm` is load-bearing for pipe tables (without it MDX tables render as literal `|` text), `rehype-slug` gives headings `id`s for in-page anchor links (e.g. `/guides/size-charts/#condition-guide`)

## Deploy

GitHub Actions → `wrangler pages deploy apps/web/out --project-name bushpop-v2`

CF Pages project: `bushpop-v2`
Staging URL: `bushpop-v2.pages.dev`

Production wiring (`bushpop.com.au` → Pages) is NOT this step — it's the cutover in MASTER-PLAN Phase 2.

## Content authoring

Ben writes prose → Claude commits MDX → auto-deploy via CF Pages.

Content lives at: `apps/web/src/app/guides/`, `apps/web/src/app/shop/` etc.
MDX components: `apps/web/mdx-components.tsx`

## Git workflow

Solo dev, auto-merge low-risk. Per `~/.claude/rules/git-workflow.md`.
Auto-merge + `delete_branch_on_merge=true` are enabled on `benobie/bushpop-v2`.
