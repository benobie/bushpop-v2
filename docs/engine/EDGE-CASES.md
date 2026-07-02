> **Provenance:** engine doc copied from `benobie/piklo-v2` @ `2419a38` at fork time (02/07/2026), with `@bushpop/*` renamed `@bushpop/*`. May drift from upstream — see `docs/engine/FORK.md`.

# Edge Cases and Gotchas

> Things that will bite you if you don't know about them. Organised by
> domain so you can scan the relevant section before making changes.
>
> See also: [AGENTS.md](../AGENTS.md) for the AI-agent-oriented version
> of these gotchas.

## Stripe and Payments

### Stripe 5xx is indeterminate, not failed

When Stripe returns a 5xx, it caches that response against the original idempotency key for 24 hours. Retrying with a new idempotency key means you end up with two outstanding operations and no way to know which one Stripe acted on. The correct response is to transition the WAL op to `indeterminate_5xx` — not `failed` and not left as `pending` — and wait for webhook reconciliation. The `reconcileRefundOpFromStripe` / `reconcileReversalOpFromStripe` helpers resolve the op by matching `metadata.piklo_payment_op_id` against incoming webhook events. The `resumePendingRefunds` recovery path explicitly excludes `indeterminate_5xx` ops to prevent the same replay trap.

See: `packages/api/src/lib/refund-service.ts` `classifyAndMarkStripeError`; ADR-013 §LB-3

### Idempotency keys are POST-only — there is no lookup by key

Idempotency keys are a dedup mechanism for POST requests, not a retrieval index. You cannot query Stripe for an object using the key you originally used to create it. When reconciling an `indeterminate_5xx` op, use the List API — `stripe.refunds.list({ payment_intent })` or `stripe.transfers.listReversals(transfer_id)` — and match the result against `metadata.piklo_payment_op_id`. Replaying the original POST only returns the cached 5xx, not the underlying truth.

See: ADR-014 §4.5; `packages/api/src/workers/reconcile-indeterminate-ops.ts`

### Metadata is load-bearing on every Stripe call

Webhooks find WAL rows by `metadata.piklo_payment_op_id`. Every `stripe.refunds.create` and `stripe.transfers.createReversal` call must include `{ piklo_payment_op_id, piklo_order_id, piklo_refund_id }` in the metadata object. Without it, a 5xx hit or webhook-based recovery has no way to locate the corresponding op row, and the payment operation becomes unrecoverable.

See: ADR-013; `packages/api/src/lib/refund-service.ts`

### `reverse_transfer` and `refund_application_fee` are independent flags

These two Stripe refund parameters have separate preconditions and must be gated independently. `reverse_transfer` is required whenever `transfer_data.destination` is set — including zero-fee listings. `refund_application_fee` is only valid when `application_fee_amount > 0`. Coupling them into a single `isDestinationCharge` boolean causes two failure modes: a destination charge with no application fee will error with `application_fee_not_found` if you pass `refund_application_fee: true`, and a destination charge with a fee but no transfer destination is an inconsistent state that should halt for manual review rather than auto-refund. Same-model code review reliably misses this — always cross-review PRs that touch Connect refund paths.

See: `packages/api/src/routes/v1/store/checkout/service.ts` `handlePaymentAfterExpiry`; ADR-014 LB2-F7-GUARDRAIL

### No `transfer.reversal.created` event exists

Stripe does not emit a discrete event when a transfer reversal is created. Instead, reversals surface via `transfer.updated` with a grown `reversals.data` array. Any webhook handler that reconciles reversal ops must listen on `transfer.updated` and walk the reversals list to find entries carrying a matching `metadata.piklo_payment_op_id`. Attempting to listen for `transfer.reversal.created` produces no events.

See: ADR-013; `packages/api/src/routes/v1/webhooks/stripe.ts`

### Webhook reconcilers must serialise on the orders row

The reversal and refund webhooks for a single order can arrive at parallel workers with milliseconds between them. Both workers can read a stale snapshot and exit without writing a terminal state, leaving the order stuck in `refund_in_progress`. Both `reconcileRefundOpFromStripe` and `reconcileReversalOpFromStripe` must open their transaction with `SELECT ... FROM orders WHERE id = ? FOR UPDATE` to serialise access.

See: ADR-014 LB-R2-2; `docs/handoffs/stripe-refund-r2-lb-fixes.handoff.md`

### Idempotency gate must include `indeterminate_5xx` ops

The idempotency check at the top of `refund-service.ts` prevents duplicate refund attempts. A naive check that only queries for `pending` ops will miss existing `indeterminate_5xx` ops and allow a second refund to be created for the same PaymentIntent. The gate must check for any non-terminal `payment_operations` record against the same PI, including `indeterminate_5xx`.

See: ADR-014 LB-R2-1; `packages/api/src/lib/refund-service.ts`

### Seller-initiated and admin-cancel post-release refunds are different code paths

After a payout has been transferred to a seller, the ordering of refund vs reversal operations differs by caller. Seller-initiated refunds run refund-first-then-reversal (buyer is always made whole; reversal failure becomes a platform-absorbed debt). Admin cancel runs reversal-first-then-refund (if the reversal fails, return 502 and do not refund the buyer — operator resolves manually). These different invariants mean the two paths cannot safely share one implementation. Currently, `processRefund` covers the seller-initiated path; admin cancel post-release returns 409 as a safety net until `adminCancelPostRelease` is implemented in R2.

See: `docs/STRIPE-MONEY-FLOW.md` §3.5; ADR-013 FM-9

### SC&T refund sequencing risk: reversal before refund

For multi-seller (separate charges and transfers) orders, the refund sequence must perform the transfer reversal before the PI partial refund. Reversing after the refund can leave the platform balance negative if reversal fails — the buyer has been refunded but the seller still holds the funds. Each item refund needs two WAL ops: one for the reversal and one for the refund, in that order.

See: `.review-synthesis-phase-4-multi-seller-bag-r2.md` CD-5; ADR-015

### `reconcile-indeterminate-ops` worker is a stub until explicitly wired

The reconciliation worker at `packages/api/src/workers/reconcile-indeterminate-ops.ts` is not registered in `startWorkers()` as of Sprint 1a. Wrapping Stripe calls in the WAL without the worker running means `indeterminate_5xx` ops accumulate indefinitely. Before relying on the WAL recovery promise, verify the worker appears in `packages/api/src/workers/index.ts`.

See: `.review-synthesis-phase-4-checkout-slice-r1.md` LB-F8-WAL-WORKER

---

## Checkout and Order Groups

### `checkout_sessions` is replaced by `order_groups`

The Phase 4 multi-seller design replaces the `checkout_sessions` table entirely. Single-seller orders become a one-allocation `order_group` with `charge_type = 'destination'`. Code that references `checkout_sessions` by name is targeting a superseded schema. The migration is a rename-plus-add-columns, not a table drop, so some FK references may survive transiently.

See: ADR-015; `.review-synthesis-phase-4-multi-seller-bag-r2.md` SC-1

### `confirming` state pauses the expiry worker

When a checkout transitions to `confirming` (during 3DS), the expiry worker must not act on it. There is a 2×15 minute grace window. Expiry that fires during 3DS triggers an automatic refund via `handlePaymentAfterExpiry`. If the `confirming` state is missing from the state machine (as it was in an early multi-seller proposal), concurrent expiry and payment-success webhooks cause a double-refund race.

See: `.review-synthesis-phase-4-checkout-slice-r1.md` LB-F10-CONFIRMING

### Stale-quote defence at pay time

The `POST /checkout/:id/pay` route recalculates the order total server-side and compares it to `expectedTotalCents` from the request body. A mismatch returns `409 CHECKOUT_STALE`. This prevents charging a different amount than the buyer saw, and is the correct defence against price changes that occur between cart creation and payment. Do not remove or bypass this check.

See: `packages/api/src/routes/v1/store/checkout/routes.ts`; `.review-synthesis-phase-4-checkout-slice-r1.md` LB-F3-PAY

### Seller readiness is re-checked at pay time

`assertCheckoutReady(sellerId)` runs at `POST /checkout/:id/pay`, not only at cart creation. A seller who goes on vacation, fails KYC, or is suspended between cart add and payment will block the checkout at pay time. Inventory reservations are released when this check fails. The same re-check runs inside `handlePaymentAfterExpiry` before issuing a refund.

See: `packages/api/src/routes/v1/store/checkout/service.ts` `confirmPayment`

### CAS races on inventory reservation

The inventory reservation system uses optimistic locking via a `version` column. If two buyers attempt to check out the same item at the same time, exactly one will win the CAS transition; the other receives a conflict error. Retrying with the same item will fail immediately since it is now reserved.

### Cross-tab bag replacement uses `BroadcastChannel` with `visibilitychange` fallback

The bag replacement signal uses `BroadcastChannel` for inter-tab communication. Browsers that do not support `BroadcastChannel` in backgrounded tabs receive the signal via a `visibilitychange` listener as fallback. Both paths must be kept in sync if the bag replacement logic changes.

---

## Database and ORM

### Drizzle 0.45.x does not support filtered unique indexes

Filtered unique indexes (e.g. `UNIQUE WHERE deleted_at IS NULL`) cannot be expressed in Drizzle 0.45.x schema DSL. Use raw SQL in the migration file instead. `drizzle-kit generate` creates the migration skeleton, but you will need to hand-edit the generated SQL to add the `WHERE` clause.

See: ADR-005

### `drizzle-kit push` is interactive for certain constraint changes

`--force` does not bypass all confirmation prompts when constraints are being dropped or altered. For CI, always use `db:migrate` (applies the migration files) rather than `db:push` (introspects and pushes). Using `push` in CI can block indefinitely waiting for stdin.

### Test schema drift affects `piklo_test` separately

Integration tests run against the `piklo_test` database on port 5433. When you run a migration locally, both `piklo` and `piklo_test` need to be updated before the test suite will pass. The `DATABASE_URL` in `packages/api/vitest.config.ts` points to `piklo_test`.

### `vi.clearAllMocks()` does not wipe mock implementations

`vi.clearAllMocks()` clears `.calls`, `.results`, and `.instances` history — it does not reset `mockResolvedValue` or `mockImplementation` stubs. Between tests that need a clean mock state, use `vi.resetAllMocks()`. Using `clearAllMocks()` in `beforeEach` will cause mocks from a previous test to bleed into the next one.

See: `packages/api/src/lib/refund-service.test.ts`

### `aspect_ratio` backfill write race

The enrichment worker (which runs on every new upload) and the one-time backfill job both write to `listings.aspect_ratio`. The backfill must use a conditional `UPDATE ... WHERE aspect_ratio IS NULL` to avoid clobbering a fresh value written by the enrichment worker during the backfill scan. The deploy gate should check that all rows are terminal — `populated`, `skipped_corrupt`, or `failed_unreadable` — not just that all rows are `populated`, because a single corrupt R2 original will otherwise stall the gate indefinitely.

See: `.review-synthesis-phase-4-sprint-2-r3.md` FM-R3-4

---

## BullMQ and Workers

### `maxRetriesPerRequest` must be `null` on the BullMQ Redis client

BullMQ uses blocking Redis commands (`BRPOPLPUSH`) that require `maxRetriesPerRequest: null`. Any positive integer value causes every worker to crash on boot with a Redis connection error. The shared Redis client in `packages/api/src/lib/redis.ts` already sets this correctly — do not change it.

### `jobId` dedup is not a debounce

BullMQ's `jobId` option prevents re-adding a job if one with that ID already exists. It does not act as a debounce or rate limiter. In flows where you need to replace an existing scheduled job (e.g. rescheduling an expiry timer), you must explicitly call `getJob(jobId)` → `job.remove()` → `add(newJob)`. Relying on `jobId` alone will silently drop the re-schedule attempt.

### Workers are active in local dev — queue side effects are not isolated

Running `pnpm dev` starts BullMQ workers alongside the API. This means search indexing, email dispatch, and payout processing are all live in local development. Do not treat local dev as a safe sandbox for testing queue-heavy flows without understanding the side effects.

---

## Content Moderation

### Sightengine downtime must not block listing creation

The Sightengine image moderation API is a hard dependency for listing publication. If the provider is unreachable at upload time, the upload must still succeed with `moderation_status = 'pending'`, and a BullMQ job must be enqueued to retry moderation asynchronously. Failing the upload synchronously on provider downtime silently blocks all listings and is the wrong default.

This is a pattern spec, not implemented yet — confirm in Sprint 1b listing-publication work that the listing-image write path exposes a `pending` state, that the queue path exists, and that there is an ops alert when the pending backlog grows beyond an expected threshold.

See: pre-ADR-015 listing spec (archived at `~/.claude/plans/archive/squishy-marinating-meteor-agent-aee43aaf3fc0be50f.md` L1383–1386).

---

## Next.js 16

### `middleware.ts` is now `proxy.ts`

The Next.js 16 upgrade renamed the middleware entrypoint. The file now lives at `apps/web/src/proxy.ts` and exports a function named `proxy`, not `middleware`. The `config.matcher` export is unchanged. If you encounter a blank screen after a routing change, verify the proxy file name and export are correct. Codemod: `pnpm dlx @next/codemod@canary middleware-to-proxy .`

### `eslint` key removed from `NextConfig`

The `eslint: { ignoreDuringBuilds: true }` option in `next.config.ts` causes `tsc` to fail with `TS2353` in Next.js 16. ESLint configuration now lives entirely in the root `eslint.config.mjs` flat config file. There is no per-package lint script in `apps/web/package.json`.

### `next-env.d.ts` and `apps/web/tsconfig.json` are rewritten on every build

`next-env.d.ts` alternates between dev and build import paths depending on which command ran last. It is gitignored per Next convention — do not re-track it. `apps/web/tsconfig.json` gets its `jsx` value flipped between `preserve` and `react-jsx` on every Next command. The working solution is to commit Next's preferred `preserve` form and stop attempting to pin it.

### Turbopack is the default bundler for both dev and build

Next.js 16 uses Turbopack by default for both `next dev` and `next build`. If a change regresses under Turbopack, opt out per-command with `--webpack` rather than reverting the upgrade.

### Cache Components placement rules

`'use cache'` belongs on the data-fetcher function (`browseListings`, `getListing`, `searchListings` in `apps/web/src/lib/data/listings.ts`), not inside `createPublicApiClient`. Wrapping the generic client factory caches across all endpoints and breaks per-endpoint tag targeting. `createAuthedApiClient` cannot be called from inside a `'use cache'` scope — cookies are a dynamic API and will fail at runtime. Use `static import { cookies } from 'next/headers'`; do not use the `@vite-ignore` dynamic import hack. The `revalidateTag(tag)` single-argument form is deprecated in Next 16 — use `revalidateTag(tag, 'profile')`. Cache profile names in `cacheLife()` calls must match the profiles defined in `next.config.ts`; drift is caught by `scripts/cache-audit.sh` in CI.

See: `apps/web/next.config.ts`; `apps/web/src/lib/data/listings.ts`; `packages/api-client/src/cache-tags.ts`

### Extensionless imports in shared packages

`packages/config`, `packages/ui`, and `packages/api-client` use extensionless imports (not `.js`) because Next.js webpack cannot resolve `.js` extensions for source-transpiled packages. All three use `moduleResolution: "Bundler"` in their `tsconfig.json`. Do not add `.js` extensions to imports in these packages.

### `@fastify/swagger` requires `jsonSchemaTransform`

When `@fastify/swagger` is used alongside `fastify-type-provider-zod`, raw `ZodType` objects crash the spec serialiser with `Cannot read properties of null (reading 'examples')`. Pass `transform: jsonSchemaTransform` (imported from `fastify-type-provider-zod`) when registering the swagger plugin.

See: `packages/api/src/server.ts`

### Never use `response: { 204: {} }`

An empty object is not a valid Zod schema and crashes `jsonSchemaTransform` with `FST_ERR_INVALID_SCHEMA`. For endpoints with no response body, use `response: { 204: z.null() }` or omit the response key for that status code entirely.

---

## Auth and Security

### Rate-limit runs before auth — `req.user` is always `undefined` at limit time

`@fastify/rate-limit` attaches on the `onRequest` hook, which fires before `preHandler` auth. Any rate-limit key function that references `req.user` will always receive `undefined` and fall back to IP-based limiting. Checkout endpoints use `allowList: () => process.env.NODE_ENV === "test"` to bypass rate-limiting in tests; see the comments above the route definitions.

See: `packages/api/src/routes/v1/store/checkout/routes.ts`

### CSRF enforcement on `/api/*`

POST, PUT, PATCH, and DELETE requests to `/api/*` that lack the `x-requested-with: XMLHttpRequest` header receive `403 Forbidden`. This is enforced in `apps/web/src/proxy.ts`. Any server-to-server call or non-browser client must include this header.

### Better Auth URL handling differs between browser and SSR

The Better Auth client uses the relative path `/api/auth` in browser contexts. During SSR, relative URLs fail `new URL()` parsing — the client requires a full base URL. The `API_URL` environment variable provides this base URL for SSR. If Better Auth calls fail only during SSR, check that `API_URL` is set correctly.

---

## Infrastructure and CI

### OpenAPI generation requires a running backend

`pnpm --filter @bushpop/api-client generate` fetches the OpenAPI spec from `http://localhost:3333/docs/json`. The API must be running before this command will succeed. CI enforces `pnpm generate && git diff --exit-code` to detect schema drift.

### No CI integration test job

Integration tests require Docker services (Postgres on port 5433, Redis, MeiliSearch). They run locally only. The CI pipeline runs build, lint, typecheck, webpack build, cache audit, and security checks (`gitleaks` + `npm audit`) — but not the API test suite. Do not assume CI green means tests pass.

### `gitleaks` false positives on test env vars

Test environment variables in `packages/api/vitest.config.ts` can trigger `gitleaks` if they contain secret-shaped strings. Known safe placeholders (`testsecret12345...`, `sk_test_placeholder`, etc.) are allowlisted in `.gitleaks.toml` at the repo root. Add new test placeholders to that file when introducing them rather than moving env vars into `package.json` scripts.

### Production boot hard-fails without provider API keys

`STARSHIPIT_API_KEY` and `RESEND_API_KEY` are optional in local development — mock providers activate automatically. Production boot fails without them. This is intentional: silent email/shipping failures in production are worse than a hard boot error.

### Seller advisory lock scope for debt and freeze operations

Concurrent debt-create and debt-resolve transactions for the same seller can race against the payout release worker ("seller run" race). Both paths must acquire `pg_advisory_xact_lock(hashtext('seller_debt_freeze:' || sellerId))` to serialise freeze and unfreeze operations. Missing this lock allows a seller to drain funds across simultaneous operations.

See: ADR-014; `docs/gpt-council/stripe-refund-r2-revised-design.md`
