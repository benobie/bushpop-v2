# bushpop-v2

Launch-1 content/SEO site for [bushpop.com.au](https://bushpop.com.au) — a fresh, minimal
**Next.js 16 + MDX** app that builds to a fully static export (`output: 'export'`) and
deploys to **Cloudflare Pages** for free on every push.

This replaces the WordPress site's SEO-critical content surface (the size-chart guides that
drive ~61% of traffic) ahead of the 09/10/2026 UltaHost renewal. No marketplace machinery
lives here yet — no API, DB, Stripe, auth, or workers.

## Two-launch shape

- **Launch 1 (this repo, now):** ~20 MDX guide pages at their exact WordPress URLs +
  Cloudflare Pages redirects. Kills the WordPress attack surface.
- **Launch 2 (later):** this repo *graduates* to the full Turborepo monorepo by forking
  piklo-v2's engine into `packages/*`. The current `apps/web` stays as `apps/web` and the
  MDX content carries over as routes — a **move, not a rewrite**. That's why this is already
  a pnpm + Turborepo workspace with a single `apps/web`, shaped like piklo-v2's `apps/web`.

Decision record: `~/projects/Bushpop/docs/architecture-decisions.md` (all six decisions
confirmed by Ben, 16/06/2026). Repo context for agents: [`.claude/CLAUDE.md`](.claude/CLAUDE.md).

## Stack

- Next.js 16.2 (App Router, React 19), `output: 'export'`, `trailingSlash: true`
- Tailwind v4, MDX via `@next/mdx`
- Pure React Server Components — no `"use client"` in content pages (zero-JS CWV profile)
- pnpm 10 + Turborepo

## Commands

```bash
pnpm install                      # install deps
pnpm --filter @bushpop/web build  # static export → apps/web/out/
pnpm --filter @bushpop/web dev    # local dev server
pnpm typecheck
```

The build emits `apps/web/out/` with trailing-slash paths (e.g.
`out/guides/size-charts/index.html`, served at `/guides/size-charts/`) — byte-for-byte URL
parity with the WordPress site.

## Redirects

Cloudflare Pages reads `apps/web/public/_redirects` (and `_headers`) from the published
output. `next.config` `redirects()` are a **no-op under `output: 'export'`** — do not add
them there. The real redirect map (1,666 `/shop/*` → `/shop` 301s, `/brand/*` 301s,
`/uncategorized/*` 410s) is produced by the URL-mapping handoff.

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`) builds the static export and runs
`wrangler pages deploy` on every push to `main`. `build` and `deploy` are separate jobs so
build stays green independently.

### ⚠️ Deploy blocker (16/06/2026): Cloudflare token scope

The deploy job is wired and ready but **cannot run yet**. The current
`~/.claude/.secrets/cloudflare-bushpop-token` has **Zone scope only** (it can read the
`bushpop.com.au` zone) but **not `Cloudflare Pages:Edit`** — so `wrangler pages deploy`
fails with an authentication error, and the Pages project can't be created.

**To unblock (Ben action):** mint a new Cloudflare API token with:

- **Permissions:** `Account` → `Cloudflare Pages` → **Edit**
- **Account Resources:** Include → `Ben@bushpop.com.au's Account`
  (id `5be04ea84f417fdc80bfcd40b9919fc2`)

Then either drop it into `~/.claude/.secrets/cloudflare-bushpop-token` (and tell Claude to
finish), or set it directly:

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo benobie/bushpop-v2 < /path/to/new-token
```

Once the token is in place, the Pages project gets created and the next push (or a re-run of
the `deploy` job) publishes to a `*.pages.dev` staging URL. `CLOUDFLARE_ACCOUNT_ID` is
already set as a repo secret.
