# Engine fork — provenance + upstream-pick recipe

The marketplace engine in this repo (`packages/*`, `apps/market`, `infra/`) is a
**plain copy** of [`benobie/piklo-v2`](https://github.com/benobie/piklo-v2) at
commit **`2419a3880e495e69ea1680639e712b7f2bb49093`** (origin/main, 02/07/2026 —
includes PR #44, the W1/E branding de-hardcode), taken via `git archive` with
fresh history (no graft). Decision record: `~/.claude/plans/build-brief-merry-garden.md` D1–D6.

## What was copied

| Upstream | Here | Notes |
|---|---|---|
| `packages/{api,db,api-client,types,config,ui}` | same | verbatim, then renamed |
| `apps/web` | `apps/market` (`@bushpop/market`) | dev port 3002; flat routes (Phase 0C) |
| `infra/docker-compose.yml` | `infra/docker-compose.dev.yml` | host ports 5435 (pg) / 6380 (redis) / 7701 (meili) |
| `infra/docker-compose.prod.yml` | `infra/docker-compose.engine.prod.yml` | + published ports 3210 (web) / 3334 (api) for Caddy |
| root tooling | same | `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc*`, `.npmrc`, `.gitleaks*`, `.dockerignore`, `.env.example` |
| `.github/workflows/ci.yml` | `.github/workflows/engine-ci.yml` | path-filtered; bushpop DB names + new ports |
| curated `docs/*.md` (15 files) | `docs/engine/` | provenance headers added |
| `packages/db/drizzle/0000–0022` + meta | same | **verbatim** — fork-local migrations start at 0023 |

## Renames applied

- `@piklo/*` → `@bushpop/*` everywhere (172 files at copy time).
- `piklo-db|redis|meilisearch`, volumes, network, `PIKLO_DB_PASSWORD` →
  `bushpop-*` / `BUSHPOP_DB_PASSWORD` (upstream FORK-M3/M5 said this is safe).
- Channel config: single `bushpop` entry (`platformFeeBps: 175`,
  `supportEmail: support@bushpop.com.au`), `DEFAULT_CHANNEL = "bushpop"`;
  seed creates only the bushpop channel; tests use slug `bushpop` +
  `bushpop_test` DB.
- Fallback email addresses (`noreply@`/`admin@`) → `bushpop.com.au`. This
  covers upstream item F4 (`workers/email.ts` fallback) as a literal swap —
  when F4 lands upstream as channel-config wiring, pick it; the diff will be
  near-trivial.

## Deliberately NOT renamed (do not "fix" these)

- **Stripe metadata keys:** `piklo_payment_op_id`, `piklo_order_id`,
  `piklo_refund_id`, `piklo_reason`, and `readPikloOpId()`. Money-safety code
  stays byte-identical to post-PR#27 upstream. Renaming would break idempotent
  webhook reconciliation against any historical Stripe test data and make
  every upstream money-path pick conflict.
- **Email template body copy** — any remaining "Piklo" strings inside Resend
  templates are replaced in Phase 1 (task 8: `listing_published_seller`
  template work) rather than blind-sed'd.

## Pruned / dropped

- `apps/admin`, `apps/mobile` (package.json stubs) — COPY lines removed from
  both Dockerfiles.
- `scripts/docs-audit.sh` + its CI job (audited upstream docs we didn't fork:
  CURRENT-STATE.md freshness etc.).
- `packages/config/tailwind/piklo.css` + its `./tailwind` export (dead since
  upstream #44; market imports `tokens` + `bushpop-overrides`).
- Upstream docs not in the curated set (audit logs, handoffs, sprint plans).

## Dependency pins added at fork (root `pnpm.overrides`)

- `ioredis: 5.10.1` — bullmq 5.79.2 hard-pins it; a fresh resolve gave the API
  5.11.1 → duplicate incompatible types.
- `stripe: 22.0.0` — matches upstream's resolved SDK; newer SDKs move the typed
  `apiVersion` literal and money code must not drift.

Lockfile was regenerated (upstream's lockfile can't merge with the content
site's); these pins keep the two money-adjacent deps byte-compatible.

## Upstream state at fork time (pick-later list)

Open piklo-v2 PRs NOT in this fork:

- **#36 `fix(audit1-A)` checkout snapshot + money-path data integrity** — pick
  after it merges upstream (money path; highest priority pick).
- #34 storefront correctness + a11y/SEO polish.
- #42 Expo mobile scaffold (not wanted — pruned apps/mobile).
- #43 docs reconciliation (not wanted — docs not forked).
- **F4** (email fallback → channel config): not yet a PR at fork time; covered
  here by literal swap (see above).
- **W4/F6 listing-tool PRs** (incl. PR2's `measurements` migration): not open
  at fork time. The `measurements` column contract is pinned identically in
  both lineages (nullable `jsonb` on `inventory_items`, numeric cm values,
  keys `chest, waist, hip, length, inseam, rise, shoulder, sleeve`, zod at the
  API edge). Whichever lineage adds it first, the other checks for the
  column and does NOT re-add it.

## How to pick an upstream change

```bash
# In piklo-v2: export the commit(s)
cd ~/projects/piklo-v2 && git format-patch -1 <sha> --stdout > /tmp/pick.patch

# Rewrite paths + names for this repo
sed -i '' -e 's|@piklo/|@bushpop/|g' -e 's| apps/web/| apps/market/|g' /tmp/pick.patch

# In bushpop-v2: apply with rejects, resolve by hand
cd ~/projects/bushpop-v2 && git apply --reject --directory=. /tmp/pick.patch
# .rej files mark hunks needing manual adaptation (flat routes, channel flips)
```

Money-path picks (`checkout`, `refund-service`, `payment-operations`,
`payout-*`, `webhooks/stripe`): apply, then run the full checkout/refund suite
before committing.

## Port map

| Thing | Local dev | Homelab prod |
|---|---|---|
| Postgres | 5435 (host) | internal only |
| Redis | 6380 (host) | internal only |
| MeiliSearch | 7701 (host) | internal only |
| API (Fastify) | 3333 | host 3334 ← `api.bushpop.xyz` (Caddy) |
| Market (Next SSR) | 3002 (dev) | host 3210 ← `market.bushpop.xyz` (Caddy) |
| Content site | 3000 (`apps/web` dev) | Cloudflare Pages (not this stack) |

## Migration lineage divergence (Phase 1, 03/07/2026)

Upstream piklo-v2 migrations ended at `0022` when Phase 1 landed. Bushpop's
`0023_melted_havok.sql` (sell-flow draft columns + `ai_generations` +
`listing_scores.breakdown`) is a **bushpop-local migration, not an upstream
pick** — checked against `origin/main` per the fork-coordination rule before
numbering. The `inventory_items.measurements` column in 0023 follows the
shared W4 column contract exactly (nullable `jsonb`, numeric cm, vocabulary
superset chest/waist/hip/length/inseam/rise/shoulder/sleeve, zod at the API
edge). **When picking piklo's W4/F6-PR2 measurements migration later: the
column already exists here — drop that hunk instead of re-adding it.**
