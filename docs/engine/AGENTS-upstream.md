> **Provenance:** engine doc copied from `benobie/piklo-v2` @ `2419a38` at fork time (02/07/2026), with `@bushpop/*` renamed `@bushpop/*`. May drift from upstream — see `docs/engine/FORK.md`.

# Piklo V2

P2P fashion marketplace - "a personal inventory app that happens to be a marketplace."

## Source Of Truth

- Keep this file aligned with [`.claude/CLAUDE.md`](/Users/ben/projects/piklo-v2/.claude/CLAUDE.md). That file is referenced from [`docs/README.md`](/Users/ben/projects/piklo-v2/docs/README.md) as the canonical project-instructions doc.
- **Start here when resuming work:** [`docs/NEXT-SESSION.md`](/Users/ben/projects/piklo-v2/docs/NEXT-SESSION.md) — opinionated pickup doc with where-we-are, what's next, MVP scope, and pitfalls.
- Use [`docs/CURRENT-STATE.md`](/Users/ben/projects/piklo-v2/docs/CURRENT-STATE.md) for what is actually built today.
- Use [`docs/MASTER-PLAN.md`](/Users/ben/projects/piklo-v2/docs/MASTER-PLAN.md) for the locked product and architecture plan.
- Do not blindly swap "Claude" for "Codex" in repo facts. The product's listing-enrichment integration is Anthropic/Claude, and some repo automation docs are still Claude-oriented.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node 22 + pnpm workspaces + Turborepo |
| Server | Fastify v5 + fastify-type-provider-zod |
| ORM | Drizzle 0.45.x (not v1 beta) |
| Validation | Zod (shared across server and clients) |
| Database | PostgreSQL with ULID primary keys stored as `varchar(26)` |
| Queue | BullMQ + Redis |
| Auth | Better Auth v1.5.6 |
| Web | Next.js 16.2.3, App Router, React 19, Tailwind v4 (Turbopack default) |
| Search | MeiliSearch |
| Storage | Cloudflare R2 (`piklo-media`, public via `media.piklo.com.au`) |
| Payments | Stripe Connect Express |
| Shipping | StarShipIt with local mock fallback |
| Email | Resend with local mock fallback |
| AI | Claude Haiku 4.5 vision via `@anthropic-ai/sdk` |

## Current Repo Reality

- Phases 0, 1a, 1b, 2A, and 3a are implemented, plus Phase 4 Sprint 0.5a/b/c (web foundation, API client, Cache Components), Sprint 1a (listing wizard, PDP, seller dashboard), Sprint 1b W1+W2 (`order_groups` schema + multi-vendor PaymentIntent), and the Lane A buyer storefront (PR #25 → `18838d6`, 29/06/2026). See [`docs/CURRENT-STATE.md`](/Users/ben/projects/piklo-v2/docs/CURRENT-STATE.md).
- The active code is concentrated in `packages/api`, `packages/db`, `packages/config`, `packages/types`, `packages/api-client`, and `apps/web`.
- `packages/api` already contains seller, store, admin, and webhook routes; BullMQ workers; Stripe, StarShipIt, Resend, and MeiliSearch integrations; plus an integration test suite.
- `apps/admin`, `apps/mobile`, and `packages/ui` currently exist mostly as package placeholders or phase markers, not full implementations.
- The web app is a full buyer storefront (browse, search, listing detail, bag, Stripe checkout, order confirmation, orders) on top of the seller side (wizard, PDP, dashboard, auth). Single-seller only; merged but not yet deployed — no human can buy in a browser until the prod deploy is executed (see [`docs/OPS-RUNBOOK.md`](/Users/ben/projects/piklo-v2/docs/OPS-RUNBOOK.md) → "Production Deploy").

## Monorepo Structure

```text
apps/web/             - Full Next.js 16 buyer storefront (browse/search/listing/bag/checkout/orders) + seller surfaces
apps/admin/           - Admin app placeholder (Phase 5)
apps/mobile/          - Expo app placeholder (Phase 6)
packages/api/         - Fastify server, routes, workers, integration tests
packages/db/          - Drizzle schema, client, seeds, migrations
packages/config/      - Env validation, channel config, taxonomy, shipping config
packages/types/       - Shared Zod/domain types
packages/ui/          - Design-system placeholder
packages/api-client/  - Generated client placeholder
docs/                 - Current state, plan, runbooks, handoffs
infra/                - Docker Compose and deploy support
```

## Key Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm format
pnpm format:check
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# Focused package work
pnpm --filter @bushpop/api test
pnpm --filter @bushpop/db db:studio

# Local services
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml down
```

## Working Rules

1. No Medusa patterns. No DI containers, no `container.resolve()`, no abstract service layers.
2. "Channel" not "brand." Piklo and Bushpop are channels.
3. ULIDs everywhere. Use `varchar(26)` plus `$defaultFn(() => ulid())`.
4. Soft delete user-facing marketplace data. Prefer lifecycle/status transitions over SQL deletes.
5. Enforce state machines through transition helpers. No raw status updates when a machine exists.
6. Stay on Drizzle 0.45.x. Do not introduce v1 beta patterns.
7. Fastify routes should use Zod schemas with `fastify-type-provider-zod`.
8. Prefer plain functions with explicit Drizzle imports and explicit dependencies.
9. Prefer domain folders shaped like `routes.ts`, `service.ts`, and `schemas.ts`. Some simpler endpoints are still single-file; follow the local pattern when touching existing code.
10. For instruction drift, trust the repo docs and source over stale summaries.
11. **Docs are first-class.** When you change `packages/db/src/schema/**`, `packages/api/src/workers/**`, `packages/api/src/routes/v1/**`, or land a new ADR, update the corresponding doc (`docs/erd.md`, `docs/state-machines.md`, `docs/workers.md`, `docs/events.md`, `docs/api-routes.md`, or `docs/DECISIONS.md`) in the **same PR** and bump its `last-verified: YYYY-MM-DD` frontmatter. CI's doc-freshness check (Phase E of the Documentation Health plan, see [MASTER-PLAN.md](docs/MASTER-PLAN.md)) blocks PRs that touch tracked code paths without a corresponding doc bump. Autopilot reviewer enforces.

## Architecture Notes

### Multi-channel model

- Global tables: users, auth/session tables, seller profiles, inventory, images, addresses.
- Channel-scoped tables: channel listings, carts, checkout sessions (legacy — W5 cutover), order_groups, orders, marketplace events, analytics/search artifacts, fees.
- Inherited tables: cart items, order items, order_group_seller_allocations, order_group_allocation_items, allocation_refunds, payout holds, disputes, refunds.
- Channel resolution in the API is host header, then `X-Channel`, then fallback to `piklo`.

### API shape

- Main server assembly lives in [`packages/api/src/server.ts`](/Users/ben/projects/piklo-v2/packages/api/src/server.ts).
- Process boot lives in [`packages/api/src/index.ts`](/Users/ben/projects/piklo-v2/packages/api/src/index.ts) and starts both Fastify and the worker set.
- Route families currently include seller inventory/images/listings/profile/stripe/orders, store categories/listings/search/cart/addresses/checkout/checkout-groups (ADR-015 W2 multi-vendor)/orders/sellers, admin users/orders/payouts, and Stripe/StarShipIt webhooks.
- Integration tests live under [`packages/api/src/test/integration`](/Users/ben/projects/piklo-v2/packages/api/src/test/integration).

### Workers and async behavior

- Worker bootstrap lives in [`packages/api/src/workers/index.ts`](/Users/ben/projects/piklo-v2/packages/api/src/workers/index.ts).
- Current workers (15, per `workers/index.ts`): image-cleanup, enrichment, backfill-aspect-ratios, checkout-expiry, shipping-label, email, event-consumer, search-sync, notification-sweeper, listing-score, refund, starshipit-poll, reconcile-indeterminate-ops, order-jobs-sweeper, and payout-release (gated behind `PAYOUT_RELEASE_ENABLED=true`).
- Workers are skipped in `NODE_ENV=test`.
- AI enrichment only starts when `ANTHROPIC_API_KEY` is present.

## Gotchas

- `drizzle-kit push` is interactive for certain constraint changes. `--force` does not bypass all prompts.
- For test schema drift, update both `piklo` and `piklo_test` before running API tests.
- BullMQ `jobId` dedup is not a debounce mechanism. Re-enqueue flows may need `getJob()` -> `remove()` -> `add()`.
- Drizzle 0.45.x does not natively support filtered unique indexes. Use raw SQL in the generated migration where needed.
- The API dev process starts workers too, so queue/search side effects are part of normal local boot.
- Production boot currently hard-fails without `STARSHIPIT_API_KEY` and `RESEND_API_KEY`.
- Test env vars live in `packages/api/vitest.config.ts` under `test.env`, NOT in `package.json` test scripts. Inline env vars in scripts trip `gitleaks` (the `BETTER_AUTH_SECRET` placeholder looks secret-shaped). `.gitleaks.toml` at the repo root has regex allowlists for known placeholders (`testsecret12345…`, `sk_test_placeholder`, etc.) — add new placeholders there if you introduce any.
- Fastify rate-limit runs `onRequest`, before `preHandler` auth. So `(req) => req.user?.id ?? req.ip` always falls back to IP in tests because `req.user` is unset. Checkout endpoints use `allowList: () => process.env.NODE_ENV === "test"` to bypass — see comments above the routes in `packages/api/src/routes/v1/store/checkout/routes.ts`.
- `vi.clearAllMocks()` does NOT wipe `mockResolvedValue` stubs — it only clears `.calls`/`.results`/`.instances` history. `vi.resetAllMocks()` is what wipes implementations. A handoff in `docs/handoffs/archive/test-fix-step-2.handoff.md` had this wrong; postscript at the bottom corrects it.
- The Stripe SDK **does not** emit a discrete `transfer.reversal.created` event. Reversals are surfaced via `transfer.updated` with a grown `reversals.data` list. Webhook handlers for reversal reconciliation must listen on `transfer.updated` and walk the reversals. See ADR-013 and the handler in [`packages/api/src/routes/v1/webhooks/stripe.ts`](/Users/ben/projects/piklo-v2/packages/api/src/routes/v1/webhooks/stripe.ts). Typecheck against `Stripe.Event["type"]` catches this before runtime.
- **Stripe 5xx is indeterminate** — Stripe caches 5xx responses under the original idempotency key for 24h and advises against retrying with a new key. WAL ops hit by a 5xx must transition to `indeterminate_5xx` (not `failed`, not left as `pending`), and recovery is via webhook reconciliation keyed off `metadata.piklo_payment_op_id` — never same-key replay via `resumePendingRefunds`. Every `stripe.refunds.create` / `stripe.transfers.createReversal` site must pass `metadata: { piklo_payment_op_id, piklo_order_id, piklo_refund_id }`. See ADR-013 and `refund-service.ts` `classifyAndMarkStripeError`.
- **Stripe idempotency keys are POST-only — there is no GET-by-key lookup.** Reconciling an `indeterminate_5xx` op cannot fetch the Stripe object using only the idempotency key from the WAL row; you must use List API (`stripe.refunds.list({ payment_intent })` or `stripe.transfers.listReversals(transfer_id)`) and match via `metadata.piklo_payment_op_id`. Replaying the original POST returns the cached 5xx (not the underlying truth). See ADR-014 §4.5 and the reconciliation cron design.
- **Webhook reconcilers must serialise on the orders row.** The reversal-then-refund webhook pair can arrive concurrently to two parallel workers; both can read stale snapshots and exit without finalising the order, leaving it stuck in `refund_in_progress`. Both `reconcileRefundOpFromStripe` and `reconcileReversalOpFromStripe` must begin their transaction with `SELECT … FROM orders WHERE id = ? FOR UPDATE`. See ADR-014 LB-R2-2 and `docs/handoffs/archive/stripe-refund-r2-lb-fixes.handoff.md`.
- **`reverse_transfer` and `refund_application_fee` on destination-charge refunds are INDEPENDENT flags.** Do not couple them into a single `isDestinationCharge` boolean — a destination charge with zero application fee still needs `reverse_transfer: true` (seller received the transfer, it must be reversed) but must NOT pass `refund_application_fee` (Stripe errors `application_fee_not_found`). Gate `reverse_transfer` on `transfer_data.destination != null` alone; gate `refund_application_fee` on `application_fee_amount > 0` alone. See `handlePaymentAfterExpiry` in [`packages/api/src/routes/v1/store/checkout/service.ts`](/Users/ben/projects/piklo-v2/packages/api/src/routes/v1/store/checkout/service.ts) and LB-F7-REFUND-FLAGS in [`docs/handoffs/phase-4-implementation-plan.md`](/Users/ben/projects/piklo-v2/docs/handoffs/phase-4-implementation-plan.md). Same-model code review will not catch this — rescue to Codex or another model for any PR touching Connect refunds.
- **Extensionless imports in shared packages.** `packages/config`, `packages/ui`, and `packages/api-client` use extensionless imports (not `.js`) because Next.js webpack can't resolve `.js` extensions for source-transpiled packages. All three use `moduleResolution: "Bundler"` in their tsconfig. The API package (`packages/api`) also uses Bundler resolution, so this is consistent across the monorepo.
- **`@fastify/swagger` requires `transform: jsonSchemaTransform` when paired with `fastify-type-provider-zod`.** Without it, raw ZodType objects hit the spec serializer and crash with `Cannot read properties of null (reading 'examples')`. Import `jsonSchemaTransform` from `fastify-type-provider-zod` and pass it as the `transform` option in `app.register(swagger, { openapi: {...}, transform: jsonSchemaTransform })`. See `packages/api/src/server.ts`.
- **Never use `response: { 204: {} }` — use `z.null()` instead.** An empty object in a response schema map is not a valid Zod schema and crashes `jsonSchemaTransform` with `FST_ERR_INVALID_SCHEMA: Invalid schema passed: {}`. For no-body responses, use `response: { 204: z.null() }` or simply omit the response key for that status code.
- **BullMQ workers require Redis `maxRetriesPerRequest: null`** (for blocking commands like `BRPOPLPUSH`). The shared Redis client in `packages/api/src/lib/redis.ts` uses `null` for this — other consumers (Fastify, rate-limit) work fine with it. Do not set to a positive integer, or every worker boot will crash.
- **Frontend consumes the API via same-origin `/api` proxy.** `apps/web/next.config.ts` rewrites `/api/:path*` → `${API_URL}/api/:path*`. The default falls back to `API_URL` env var then `http://localhost:3333`. Better Auth client uses relative `/api/auth` in browser contexts but a full URL during SSR (relative URLs fail `new URL()` parsing server-side).
- **Generated OpenAPI types live at `packages/api-client/src/schema.d.ts`** and are regenerated via `pnpm --filter @bushpop/api-client generate`. This hits the running API's `/docs/json` endpoint at `http://localhost:3333/docs/json` — backend must be running. CI enforces `pnpm generate && git diff --exit-code`.
- **Next.js 16: `middleware.ts` → `proxy.ts`.** The file that handles channel rewriting, CSRF on `/api/*`, `x-forwarded-for` forwarding, and the optimistic auth guard now lives at [`apps/web/src/proxy.ts`](/Users/ben/projects/piklo-v2/apps/web/src/proxy.ts) and exports a function named `proxy` (not `middleware`). The `config.matcher` export is unchanged. Use `pnpm dlx @next/codemod@canary middleware-to-proxy .` if you need to re-run the rename.
- **Next.js 16 removed the `eslint` key from `NextConfig`.** Setting `eslint: { ignoreDuringBuilds: true }` in `apps/web/next.config.ts` now fails `tsc` with `TS2353`. The `next lint` command is also gone — root ESLint flat config (`eslint.config.mjs`) handles web linting, and `apps/web/package.json` has no per-package `lint` script.
- **Next.js 16 rewrites `next-env.d.ts` AND `apps/web/tsconfig.json` on every `next build`/`next dev`.**
  - `next-env.d.ts` flips between `import "./.next/types/routes.d.ts"` (build) and `import "./.next/dev/types/routes.d.ts"` (dev). Any committed form is wrong for the other mode. **Per Next convention, this file is gitignored** (`.gitignore` contains `next-env.d.ts`). Do not re-track it.
  - `apps/web/tsconfig.json` — Next 16 flips `"jsx": "react-jsx"` → `"jsx": "preserve"` on every build. Both forms compile, but the worktree will show `tsconfig.json` as dirty after running any Next command. **Open gotcha** — needs investigation to decide between gitignore, pin via editor settings, or just commit Next's preferred `"preserve"` form and stop fighting it.
- **Turbopack is the default bundler in Next.js 16 for both `next dev` and `next build`.** Piklo's `apps/web` runs clean on Turbopack (verified 2.1s compile). If a future change regresses under Turbopack, opt out per-command with `next build --webpack` / `next dev --webpack` rather than reverting the upgrade.
- **Cache Components model (Next.js 16.2.3+, Sprint 0.5c).** Enabled via `cacheComponents: true` at the top level of [`apps/web/next.config.ts`](/Users/ben/projects/piklo-v2/apps/web/next.config.ts) — renamed from `experimental.dynamicIO` in the Next 15 → 16 upgrade. Without the flag, `'use cache'` and `cacheLife()` are inactive and the app falls back to the previous caching model (route segment configs, explicit fetch options). Named `cacheLife` profiles live in a top-level `cacheLife: { browse, 'listing-detail', search }` block in `next.config.ts`; profile names MUST match across both the `'use cache'` read sites and any `revalidateTag(tag, 'profile')` invalidation sites — drift is detected by [`scripts/cache-audit.sh`](/Users/ben/projects/piklo-v2/scripts/cache-audit.sh), wired into CI. **`'use cache'` placement rule:** directive goes on the **data-fetcher function** (`browseListings`, `getListing`, `searchListings` in [`apps/web/src/lib/data/listings.ts`](/Users/ben/projects/piklo-v2/apps/web/src/lib/data/listings.ts)) — NEVER inside `createPublicApiClient` in `packages/api-client/src/server.ts`. Wrapping the generic client factory caches across all endpoints and breaks per-endpoint cache-tag targeting; it is also likely unserialisable because `openapi-fetch`'s Client exposes method properties. **Tag every cached function at BOTH layers (belt-and-braces, per GPT-Council R1 LB-1):** call `cacheTag(...)` from `next/cache` inside the `'use cache'` body (binds the function-cache entry) AND pass the same tag through `createPublicApiClient({ tags: [...] })` (binds the fetch-cache entry via `fetch.next.tags`). Tagging only one layer leaves the other intact when `revalidateTag(tag, profile)` is called. Use channel-namespaced tags via [`channelListingsTag(channel)` / `channelListingTag(channel, handle)` / `channelTag(channel, resource, id?)`](/Users/ben/projects/piklo-v2/packages/api-client/src/cache-tags.ts) — the Piklo helper was renamed from `cacheTag` in Sprint 0.5c to avoid shadowing `next/cache`'s own `cacheTag` export. Invalidate with `revalidateTag(tag, 'profile')` in a Server Action — the single-arg `revalidateTag(tag)` form is deprecated in 16. The authed client [`createAuthedApiClient`](/Users/ben/projects/piklo-v2/packages/api-client/src/server.ts) uses a standard static `import { cookies } from 'next/headers'` — do NOT reintroduce the dynamic-import `@vite-ignore` hack; Turbopack's static-analysis dynamic-boundary tracking under Cache Components requires the static form. Calling `createAuthedApiClient` from inside a `'use cache'` scope fails at runtime (cookies are a dynamic API). **Default `'use cache'` placement for new code:** data-fetcher level for reusable entities (listings, sellers, categories); page-level only for shell-only prerender pages with no dynamic chrome. (FM-R2-1, SA-R3-1, GPT-Council R1 FM-2/FM-4/FM-7/LB-1)

## Workflow

- Explore -> Plan -> Implement -> Verify for any task touching multiple files or cross-cutting behavior.
- When updating repo instructions, sync this file with [`.claude/CLAUDE.md`](/Users/ben/projects/piklo-v2/.claude/CLAUDE.md) unless the divergence is intentional and documented.

## Session Naming

`piklo-v2-<feature>-<task>`

## Task tracking

Piklo tasks live in `life.tasks` via Postgres RPCs. Use the `/task` skill.
(Migrated off Vikunja in Phase 3.5 cutover, 18/04/2026.)

## Automation

### Conductor

- Daily orchestration lives behind `/conductor`.
- State file: [`docs/conductor-state.json`](/Users/ben/projects/piklo-v2/docs/conductor-state.json)
- Existing repo docs point at the Claude skill entrypoint: `~/.claude/skills/conductor/references/conductor-entrypoint-piklo-v2.md`
- Phases: `MERGE -> HEALTH -> DISPATCH -> [AUDIT] -> [STRATEGY] -> [MARKETING] -> DIGEST`
- Sentinel: `/tmp/conductor-piklo-v2-YYYYMMDD-done`
- Dashboard: [helm.bushpop.xyz](https://helm.bushpop.xyz)

### Autopilot

- Manual dispatch: `/autopilot new <slug>`
- Worktree location: `.worktrees/<slug>/`
- State file: `docs/<slug>-autopilot.json`
- Existing repo example is Claude-oriented:

```bash
claude -p "Run /autopilot new <slug> --bypass-review --skip-research in /Users/ben/projects/piklo-v2" \
  --max-turns 200
```

### GPT-Council

- Manual design review via `/council` and `/gpt-council`
- Used before autopilot for plan validation

### n8n workflows

| Workflow | Purpose |
|----------|---------|
| `piklo-v2-conductor-daily` | 6am AEDT cron -> SSH -> conductor |
| `piklo-v2-dispatch-on-complete` | GitHub webhook -> archive + dispatch next |
| `piklo-v2-merge-on-green` | GitHub webhook -> auto-merge on CI pass |
