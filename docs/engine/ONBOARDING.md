> **Provenance:** engine doc copied from `benobie/piklo-v2` @ `2419a38` at fork time (02/07/2026), with `@piklo/*` renamed `@bushpop/*`. May drift from upstream — see `docs/engine/FORK.md`.

---
last-verified: 2026-05-03
---

# Developer Onboarding

> You've cloned the repo and followed the [README](../README.md) setup.
> This guide explains how the codebase is organised and how to do common
> dev tasks.

---

## Verify Your Setup

Run through this checklist before doing anything else.

1. Docker services are healthy:
   ```bash
   docker compose -f infra/docker-compose.dev.yml ps
   ```
   Expect three containers (`bushpop-db`, `bushpop-redis`, `bushpop-meilisearch`) with status `healthy`.

2. Start the full stack:
   ```bash
   pnpm dev
   ```
   Turborepo runs all packages in parallel. Wait for the API and web log lines to settle (~15s on cold start).

3. API is up: http://localhost:3333/docs — Swagger UI with 55+ endpoints.

4. Web is up: http://localhost:3002 — the market storefront (`apps/market`). Port 3000 in this fork is `apps/web`, the separate Launch-1 content/SEO site, not the engine storefront.

5. Test database exists. The test suite targets `bushpop_test` (not `bushpop`). If `pnpm db:seed` has not been run yet:
   ```bash
   createdb -p 5435 -h localhost -U bushpop bushpop_test
   ```
   Then run migrations against it:
   ```bash
   DATABASE_URL=postgres://bushpop:bushpop_dev@localhost:5435/bushpop_test pnpm db:migrate
   ```

---

## Recent architectural changes

The architecture below reflects the following landed ADRs. If something here doesn't match the code, prefer the code and flag it in [`DECISIONS.md`](DECISIONS.md).

- **[ADR-015](DECISIONS.md#adr-015-multi-vendor-cart--hybrid-charge-types-12042026)** — Multi-vendor cart hybrid: destination charges (single-seller, fee at charge, one transfer) for one-seller carts; separate charges & transfers (SC&T) for multi-seller carts. `order_groups` replaces `checkout_sessions`.
- **[ADR-016](DECISIONS.md#adr-016-order-number-format--dual-sequence-pkl-g-nnnnnn-groups-and-pkl-s-nnnnnn-orders-19042026)** — Human-readable order numbers: `PKL-G-NNNNNN` for the checkout group, `PKL-S-NNNNNN` for each per-seller split.
- **[ADR-017](DECISIONS.md#adr-017-stripe-reserve-disclosure--pre-connect-block--payout-email-reinforcement-19042026)** — Stripe reserve disclosure: non-collapsible block on `/become-a-seller` plus a payout-email footer when reserve materially reduces the transfer.
- **[ADR-018](DECISIONS.md#adr-018-amlctf-posture--provisional-s63a4-incidental-transfer-framing-with-binding-operational-controls-19042026)** — AML/CTF binding controls: fully automated SC&T fund transit, 60-minute zero-balance enforcement, no internal stored value, hard per-cart AUD cap, ABN-registered seller exclusion at launch, structured audit logs ≥ 7 years.

### Stripe Connect crash course

Piklo runs **two Stripe Connect rails** in parallel.

- **Destination charges** — used when a cart has items from a single seller. The buyer's PaymentIntent debits the platform; Stripe pulls the application fee and pushes the remainder to the seller's connected account in a single move. One transfer, fee math handled by Stripe.
- **Separate charges & transfers (SC&T)** — used when a cart has items from two or more sellers. The platform takes one PaymentIntent for the full cart total, then issues one Stripe Transfer per seller after `payment_intent.succeeded`. Fee math is computed by Piklo (per-allocation), one transfer per seller, async via the BullMQ fan-out.

Both rails coexist in `order_groups` (single-seller groups have one allocation with `charge_type='destination'`). Why both: destination is simpler and shipped first; SC&T is the only way to support multi-seller checkout without firing N 3DS challenges. See [`STRIPE-MONEY-FLOW.md`](STRIPE-MONEY-FLOW.md) for the full money flow and [`PAYMENT-FLOW.md`](PAYMENT-FLOW.md) for the per-rail details. (`CHECKOUT-FLOW.md` is forthcoming via Phase C1.)

---

## Monorepo Walkthrough

```mermaid
graph TD
  web["apps/web<br/>(Next.js 16)"]
  api["packages/api<br/>(Fastify + BullMQ)"]
  db["packages/db<br/>(Drizzle schema)"]
  cfg["packages/config<br/>(env, channels, taxonomy)"]
  types["packages/types<br/>(shared Zod/domain types)"]
  client["packages/api-client<br/>(generated OpenAPI client)"]
  ui["packages/ui<br/>(Radix + CVA + Tailwind v4)"]
  admin["apps/admin<br/>(placeholder)"]:::placeholder
  mobile["apps/mobile<br/>(placeholder)"]:::placeholder

  web --> client
  web --> types
  web --> ui
  api --> db
  api --> cfg
  api --> types
  client --> types

  classDef placeholder stroke-dasharray: 5 5,color:#888;
```

| Package | Purpose | You will touch this when... |
|---|---|---|
| `apps/web` | Next.js 16 storefront | Adding pages, components, or cached data fetchers |
| `packages/api` | Fastify server + BullMQ workers + integration tests | Adding routes, services, or background jobs |
| `packages/db` | Drizzle schema, migrations, seed | Changing database tables |
| `packages/config` | Env validation, channel config, taxonomy, shipping config | Adding categories, channels, or shipping rules |
| `packages/types` | Shared Zod/domain types | Adding types used by both API and web |
| `packages/api-client` | Generated OpenAPI client (from `openapi-ts`) | After adding or changing API routes |
| `packages/ui` | Design system (Radix UI + CVA + Tailwind v4) | Adding shared design-system primitives or styling helpers |
| `apps/admin` | Admin panel placeholder | Phase 5 — currently empty |
| `apps/mobile` | Expo mobile placeholder | Phase 6 — currently empty |

### Active vs placeholder packages

`apps/admin` and `apps/mobile` are placeholders — empty packages with no scripts or dependencies. Do not try to run them.

`packages/ui` is **active**: it ships a small design-system surface (Radix primitives wrapped with CVA + Tailwind v4) consumed by `apps/web`. Public exports live in [`packages/ui/src/index.ts`](../packages/ui/src/index.ts) — `Button`, `Input`, `Card`, `Textarea`, `Label`, `Badge`, `Avatar`, `Skeleton`, `VisuallyHidden`, `Select`, plus a `cn()` class-merger via `./cn`. Add new primitives there rather than reinventing styled components inside `apps/web`.

Everything else is active and wired into the Turborepo pipeline.

### Schema organisation

Database tables in `packages/db/src/schema/` are split by domain:

| File | Covers |
|---|---|
| `user-domain.ts` | Users, profiles |
| `auth.ts` | Sessions, OAuth accounts |
| `inventory.ts` | Seller inventory items, images |
| `listings.ts` | Channel listings (published view of inventory) |
| `commerce.ts` | Carts, orders, order items, payouts, refunds |
| `categories.ts` | Category taxonomy |
| `channels.ts` | Channel definitions |
| `notifications.ts` | In-app notifications |
| `saved-searches.ts`, `wishlists.ts` | Customer preferences |
| `events.ts` | Marketplace event log |
| `listing-scores.ts`, `listing-reports.ts` | Quality and moderation |
| `infrastructure.ts` | Idempotency keys, config |

---

## Common Dev Workflows

### Adding a New API Route

Domain folders under `packages/api/src/routes/v1/` follow a three-file pattern. Look at `packages/api/src/routes/v1/store/search/` or `packages/api/src/routes/v1/seller/listings/` as reference examples.

1. Create the domain folder:
   ```
   packages/api/src/routes/v1/<family>/<domain>/
     routes.ts    ← Fastify route definitions + inline or imported Zod schemas
     schemas.ts   ← Zod schemas for request/response (if non-trivial)
     service.ts   ← Business logic with explicit Drizzle imports
   ```
   Simpler endpoints (like `packages/api/src/routes/v1/store/listings.ts`) can remain a single file. Follow the local pattern when touching existing code.

2. Register the routes in `packages/api/src/server.ts`:
   ```ts
   import { myNewRoutes } from "./routes/v1/<family>/<domain>/routes";
   // ...
   server.register(myNewRoutes, { prefix: "/api/v1" });
   ```

3. Use `fastify-type-provider-zod` for request/response typing. The server is already configured with `serializerCompiler` and `validatorCompiler` — your route schemas are picked up automatically.

4. All IDs are ULIDs: `varchar(26)` with `$defaultFn(() => ulid())`.

5. After adding the route, regenerate the API client (see below).

### BullMQ workers

Workers are bootstrapped in [`packages/api/src/workers/index.ts`](../packages/api/src/workers/index.ts). They start alongside Fastify and are skipped entirely when `NODE_ENV=test`. The enrichment worker only starts when `ANTHROPIC_API_KEY` is present.

The current registry (12 steady-state workers plus a one-off backfill):

| Worker | Queue | Trigger | Idempotency | Retry / concurrency | Env-gating |
|---|---|---|---|---|---|
| `image-cleanup` | `image-cleanup` | Repeating, every 1 hour | Repeat-job key | Default attempts; `removeOnFail: 3` | None |
| `enrichment` | `ai-enrichment` | On-demand from inventory upsert; debounced 30 s | `jobId = enrich-${inventoryItemId}` | Concurrency 2; rate-limited 10/min | `ANTHROPIC_API_KEY` (worker not started without) |
| `checkout-expiry` | `checkout-expiry` | Delayed per session + sweep | `jobId = expire-${sessionId}` | Concurrency 5; `removeOnFail: 3` | None |
| `shipping-label` | `shipping-label` | On-demand post-payment | `jobId = label-${orderId}` + DB guard | `attempts: 3`, exp backoff 5 s; concurrency 3 | None |
| `email` | `email` | On-demand post-payment / from sweeper | `jobId = notificationId ?? ${type}-${orderId}` | `attempts: 3`, exp backoff 5 s; concurrency 1; rate 2/s | Falls back to mock without `RESEND_API_KEY` (prod hard-fails on boot) |
| `event-consumer` | `marketplace-events` | On-demand from `dispatchEvent()` | `marketplace_events` row provides idempotency | Concurrency 5 | None |
| `search-sync` | `search-sync` | On-demand from `dispatchEvent()` | Per-event entityId | `attempts: 3`, exp backoff 5 s; concurrency 5 | None |
| `notification-sweeper` | `notification-sweeper` | Repeating, every 5 minutes | `jobId = notification-sweeper-repeat` | Concurrency 1; `removeOnFail: 5` | None |
| `listing-score` | `listing-score` | On-demand on listing/score events | `jobId = score-${channelListingId}` | Concurrency 5; `removeOnFail: { count: 10 }` | None |
| `refund` | `refund` | On-demand from refund WAL | Payment-WAL row provides idempotency | `attempts: 3`, exp backoff 5 s; concurrency 1 | None |
| `starshipit-poll` | `starshipit-poll` | Scheduled daily 09:20 AEST (`upsertJobScheduler`) | Scheduler-managed | Concurrency 1; `removeOnFail: 3` | Falls back to mock without `STARSHIPIT_API_KEY` (prod hard-fails on boot) |
| `reconcile-indeterminate-ops` | `reconcile-indeterminate-ops` | Repeating, every 15 minutes | Scheduler key `reconcile-tick` | Concurrency 1; `removeOnFail: 50` | None |

A one-off `backfill-aspect-ratios` worker also runs once on startup; it is not part of the steady-state set.

For ground-truth queue topology, sharp edges, and the reasoning behind shared queues, see [`workers.md`](workers.md).

### Adding a BullMQ Worker

1. Create the worker file in `packages/api/src/workers/<name>.ts`. Use an existing worker (`email.ts`) as a structural reference — define a named queue constant, a lazy queue getter, and a `start<Name>Worker()` export.

2. Register it in `packages/api/src/workers/index.ts` inside `startWorkers()`:
   ```ts
   import { startMyWorker } from "./my-worker.js";
   // ...
   startMyWorker();
   console.log("[workers] My worker started");
   ```

3. Workers are automatically skipped when `NODE_ENV=test` — the guard at the top of `startWorkers()` returns early, so your worker does not need its own test guard.

4. If the worker requires `ANTHROPIC_API_KEY` or another optional env var, wrap it like the enrichment worker:
   ```ts
   if (process.env.MY_VAR) {
     startMyWorker();
   } else {
     console.log("[workers] MY_VAR not set — my worker disabled");
   }
   ```

### Running a Database Migration

1. Edit or create a schema file in `packages/db/src/schema/`.

2. Generate the migration SQL:
   ```bash
   pnpm db:generate
   ```
   This creates a new file under `packages/db/src/migrations/`.

3. Apply to the **dev** database:
   ```bash
   pnpm db:migrate
   ```

4. Apply to the **test** database separately (test suite uses `bushpop_test`):
   ```bash
   DATABASE_URL=postgres://bushpop:bushpop_dev@localhost:5435/bushpop_test pnpm db:migrate
   ```

5. **Drizzle 0.45.x caveat:** filtered/partial indexes are supported, but do not introduce Drizzle v1 beta patterns — they are not compatible. Stay on the 0.45.x API surface.

### Regenerating API Client Types

The `packages/api-client` package is generated from the live OpenAPI spec. Do this any time you add or change a route.

1. Make sure the API is running:
   ```bash
   pnpm dev
   # or just the API:
   pnpm --filter @bushpop/api dev
   ```

2. Generate:
   ```bash
   pnpm --filter @bushpop/api-client generate
   ```
   This hits http://localhost:3333/docs/json and regenerates `packages/api-client/src/schema.d.ts`.

3. Commit the updated `schema.d.ts` alongside your route changes.

### Adding a Cached Data Fetcher (Next.js 16)

Data fetchers live in `apps/web/src/lib/data/`. The pattern is established in `listings.ts`.

1. Create a new fetcher file or add a function to an existing one.

2. Import the right pieces:
   ```ts
   import { cacheLife, cacheTag } from "next/cache";
   import { channelListingsTag } from "@bushpop/api-client/cache-tags";
   import { createPublicApiClient } from "@bushpop/api-client/server";
   ```

3. Write the fetcher with `'use cache'` on the function body, **not** on `createPublicApiClient`:
   ```ts
   export async function myFetcher(channel: string) {
     "use cache";
     cacheLife("browse");                                  // matches a profile in next.config.ts
     const tag = channelListingsTag(channel);
     cacheTag(tag);                                        // tags the function-cache entry
     const api = createPublicApiClient({ tags: [tag] });   // tags the fetch-cache entry
     const { data, error } = await api.GET("/api/v1/...");
     if (error) throw new Error(`myFetcher failed: ${JSON.stringify(error)}`);
     return data;
   }
   ```

4. The dual-tagging (`cacheTag` + `createPublicApiClient({ tags })`) is intentional. Both layers register in the same global tag system but bind to different cache entries. Tagging only one leaves the other stale when a Server Action calls `revalidateTag`.

5. Use channel-namespaced tag helpers from `@bushpop/api-client/cache-tags` — never use bare string tags like `revalidateTag('listings')`, which would purge both channels.

6. Verify the tags are wired correctly:
   ```bash
   bash scripts/cache-audit.sh
   ```

---

## Testing

### Running tests

```bash
# All packages
pnpm test

# API only (most common)
pnpm --filter @bushpop/api test

# Watch mode
pnpm --filter @bushpop/api test -- --watch
```

### What you need to know

- Tests are **integration tests** — they hit a live Postgres, Redis, and MeiliSearch. Docker services must be running.
- Tests are **not in CI** for this reason. Run them locally before opening a PR.
- Test env vars are defined in `packages/api/vitest.config.ts` under `test.env`. They are not in `.env` or `package.json` scripts (this is deliberate — prevents gitleaks flagging placeholder secrets).
- Test database is `bushpop_test` at `postgres://bushpop:bushpop_dev@localhost:5435/bushpop_test`.
- `fileParallelism: false` — tests run serially to avoid Postgres/Redis contention.
- Workers are automatically disabled in `NODE_ENV=test`.

### Common gotcha: `vi.resetAllMocks()` vs `vi.clearAllMocks()`

- `vi.clearAllMocks()` — clears call history and return values, but **keeps mock implementations intact**. Safe for use in `beforeEach`.
- `vi.resetAllMocks()` — wipes implementations too. If you call this in `beforeEach`, any `vi.fn().mockImplementation(...)` set in `beforeAll` will be gone and the mock will return `undefined`.

Use `clearAllMocks` in `beforeEach` and `resetAllMocks` only when you deliberately want to tear down all mock implementations.

---

## Where to Go Deeper

### Architecture & ADRs

| Document | What it covers |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System overview, request lifecycle, plugin chain, error hierarchy, idempotency, caching model |
| [`DECISIONS.md`](DECISIONS.md) | Architecture decision log — why things are the way they are |
| [`MASTER-PLAN.md`](MASTER-PLAN.md) | Phase roadmap, Documentation Health plan, feature backlog |
| [`STRIPE-MONEY-FLOW.md`](STRIPE-MONEY-FLOW.md) | Stripe Connect money flow at the rail level |
| [`PAYMENT-FLOW.md`](PAYMENT-FLOW.md) | Per-rail payment lifecycle, payout hold machine, refund paths |

### Operations & Audits

| Document | What it covers |
|---|---|
| [`OPS-RUNBOOK.md`](OPS-RUNBOOK.md) | Production operations and incident response |
| [`EDGE-CASES.md`](EDGE-CASES.md) | Known edge cases and compensating flows |
| [`infrastructure-audit.md`](infrastructure-audit.md) | Infrastructure-readiness audit |
| [`security-audit.md`](security-audit.md) | Security-posture audit |
| [`code-quality.md`](code-quality.md) | Code-quality findings and follow-ups |

### Reference

| Document | What it covers |
|---|---|
| [`api-routes.md`](api-routes.md) | Full API route catalogue with request/response shapes |
| [`erd.md`](erd.md) | Entity-relationship diagram |
| [`state-machines.md`](state-machines.md) | Order, listing, payout, and order-group state machines |
| [`workers.md`](workers.md) | Worker inventory: queues, concurrency, sharp edges |
| [`events.md`](events.md) | Marketplace event catalogue (producer / consumer map) |
| [`CURRENT-STATE.md`](CURRENT-STATE.md) | What is built, what is in progress, sprint status |
| [`AGENTS.md`](../AGENTS.md) | Working rules, architecture notes, key commands |
