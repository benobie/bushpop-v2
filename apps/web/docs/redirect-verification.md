# Redirect & post-deploy verification

Tooling to verify `_redirects` behaviour and basic SEO/security hygiene
against a live Cloudflare Pages deployment. Lives at
`apps/web/scripts/check-redirects.mjs` and
`apps/web/scripts/post-deploy-check.mjs` — both zero-dependency Node 22
scripts using built-in `fetch`.

> **The full URL inventory (real GSC traffic data — clicks, impressions,
> full 1,927-row URL list) is NOT in this repo, on purpose.** This is a
> public repo; that data lives in a private local CSV outside the
> `bushpop-v2` checkout. Only a hand-picked, traffic-free structural
> sample (`apps/web/scripts/fixtures/redirect-fixture.csv`) is committed.

## The three modes

### 1. Pre-cutover full inventory sweep

Run manually, once, before flipping DNS, against the complete 1,927-URL
inventory (outside the repo):

```bash
node apps/web/scripts/check-redirects.mjs \
  --base https://bushpop-v2.pages.dev \
  --inventory /path/to/private/url-inventory.csv \
  --concurrency 5 --delay-ms 150 \
  --out failures.csv
```

Inventory CSV columns: `url,status,section,clicks,impressions,action,redirect_target,notes`.
`action` drives the expected disposition: `keep-exact` (same path, 200, 0
hops), `redirect` (1 hop 301/308 → 200; 2 hops warns, 3+ fails, loops
fail), `drop` (410, or a single 301 to home/`/gone/` per `redirect_target`).

### 2. Launch-day sample

A stratified sample run against production immediately post-cutover:

```bash
node apps/web/scripts/check-redirects.mjs \
  --base https://bushpop.com.au \
  --inventory /path/to/private/url-inventory.csv \
  --sample 300
```

`--sample N` always includes every `keep-exact` row, then takes a
deterministic stride sample (no randomness) proportional across the
remaining strata — reruns are reproducible.

### 3. CI fixture smoke test

Runs automatically: after every deploy (`.github/workflows/deploy.yml`)
and nightly (`.github/workflows/redirect-health.yml`, 22:00 UTC +
`workflow_dispatch`). Uses the committed structural fixture, no traffic
data:

```bash
node apps/web/scripts/check-redirects.mjs \
  --base https://bushpop-v2.pages.dev \
  --fixture apps/web/scripts/fixtures/redirect-fixture.csv
```

Fixture CSV columns: `path,expected_status,expected_location_prefix`
(final status + final landing-path prefix after following all hops).

## Flag reference (`check-redirects.mjs`)

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--base <url>` | yes | — | Origin to test against |
| `--inventory <csv>` | one of inventory/fixture | — | Full GSC-derived CSV |
| `--fixture <csv>` | one of inventory/fixture | — | Hand-picked structural CSV |
| `--concurrency N` | no | 5 | Parallel workers |
| `--delay-ms N` | no | 150 | Per-worker delay between requests |
| `--sample N` | no | (all rows) | Stratified by `action`/`expected_status`, deterministic |
| `--out <path>` | no | — | Writes failures+warnings CSV |
| `--format summary\|csv` | no | `summary` | `csv` also prints failures to stdout |

Exit code is `0` iff zero FAILs (WARNs don't fail the run). Every request
walks the redirect chain manually (`redirect: "manual"`) — nothing is
auto-followed — with a HEAD-first, GET-fallback strategy (needed because
the `/uncategorized/*` 410 Pages Function only implements `onRequestGet`).

## `post-deploy-check.mjs`

Zero-dependency post-deploy hygiene check: content pages are indexable
(200, no noindex signal), the branded 404 page is itself noindexed,
`apps/web/public/_headers` security headers are present, `/robots.txt`
references the production sitemap, and `/sitemap.xml` parses with a
sane URL count.

```bash
node apps/web/scripts/post-deploy-check.mjs --base https://bushpop-v2.pages.dev
```
