> **Provenance:** engine doc copied from `benobie/piklo-v2` @ `2419a38` at fork time (02/07/2026), with `@bushpop/*` renamed `@bushpop/*`. May drift from upstream — see `docs/engine/FORK.md`.

# Operations Runbook

Operational procedures for piklo-v2. "LIVE" sections describe procedures backed by shipped code. "TODO" sections describe work that is specified but not yet built — do not attempt the procedure, the code path does not exist.

## Local Development

### Start services

```bash
docker compose -f infra/docker-compose.yml up -d
```

### Stop services

```bash
docker compose -f infra/docker-compose.yml down
```

### Reset database

```bash
docker compose -f infra/docker-compose.yml down -v  # removes volumes
docker compose -f infra/docker-compose.yml up -d
pnpm db:migrate
pnpm db:seed
```

### Run migrations

```bash
pnpm db:generate   # after schema changes
pnpm db:migrate    # apply migrations
pnpm db:seed       # seed data
```

### If migrations fail with "relation already exists" or similar

Drizzle's migration journal is out of sync with actual DB state. Easiest fix is a clean reset:

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
pnpm db:migrate && pnpm db:seed
```

This destroys local data. If you need to preserve data, export it first with the pg_dump procedure below.

## Backup & Restore

### Manual database backup (LIVE — Phase 0 automated script still TODO)

```bash
# Snapshot the local container DB to a timestamped file
mkdir -p ~/backups/piklo-v2
docker exec piklo-db pg_dump -U piklo -d piklo --clean --if-exists \
  > ~/backups/piklo-v2/piklo-$(date +%Y-%m-%d-%H%M).sql
ls -lh ~/backups/piklo-v2/ | tail -5
```

The `--clean --if-exists` flags make the dump self-contained — restoring it will drop and recreate each object.

### Manual database restore

```bash
# Restore from a timestamped snapshot (destructive)
cat ~/backups/piklo-v2/piklo-YYYY-MM-DD-HHMM.sql | \
  docker exec -i piklo-db psql -U piklo -d piklo
```

### Production backup — TODO

No automated pg_dump schedule, no volume snapshots, no off-host replication. The first production deploy (below) keeps backups manual via the `pg_dump`/restore procedure above (run against the `piklo-db` container on the homelab). Managed Postgres + automated backups is a pre-GMV follow-up.

## Production Deploy (Coolify on homelab)

First production deploy of the API + web stack to Coolify (`coolify.bushpop.xyz`, host `154.26.158.150`), test-mode Stripe. Stack file: `infra/docker-compose.prod.yml` (5 services: `piklo-db`, `piklo-redis`, `piklo-meilisearch`, `api`, `web`).

### Architecture decisions (locked 15/06)

- **Single Coolify Docker-Compose stack**, one internal network. Build context = repo root.
- **API runs `tsx src/index.ts`, NOT `node dist`.** `@bushpop/config`/`@bushpop/types`/`@bushpop/db` export raw `./src/index.ts` and config/types have no build script, so a compiled `dist` can't resolve workspace imports at runtime. The prod image therefore keeps dev deps (`tsx` + `drizzle-kit`). **Image-size trade-off (INF-M1):** because those are runtime-required, a `--prod` install is NOT an option (it would drop `tsx`/`drizzle-kit` and break boot), so the image carries the full dev toolchain (vitest, tsc, etc.) — ~400MB heavier + wider attack surface. The only safe slim is bundling the API with tsup (`noExternal: [/@bushpop/]`, native deps external) for a real `node dist` artifact; deferred as pre-GMV hardening.
- **Containers run as non-root (`USER node`, uid 1000)** in both Dockerfiles (INF-H1). The API's `node_modules`/pnpm store stay root-owned but world-readable, so `tsx`/`drizzle-kit` execute fine without a costly `chown -R` of the dep tree.
- **Healthchecks: liveness for restarts, readiness for monitoring (INF-L1/L2).** Both container `HEALTHCHECK`s probe `/health/live` (or `/` for web) — they decide container restart, so they must NOT depend on external services. A Stripe/Meili/R2 outage must not restart the API. Use `/health/ready` (checks db/redis/stripe, returns 503 on critical-dep down) for external monitoring/alerting only — never as a restart gate. `web` gates on the api container being healthy (`/health/live`), which only passes after migrate-on-boot completes, so web never serves before migrations finish.
- **Migrate-on-boot:** `packages/api/docker-entrypoint.sh` runs `pnpm --filter @bushpop/db db:migrate` (23 migrations) before exec'ing the server. Single replica → no migration race.
- **Workers are in-process** — one `api` container runs Fastify + all 15 BullMQ workers. No separate worker service.
- **MeiliSearch self-bootstraps** the `listings_piklo` index on the Fastify `onReady` hook behind a versioned Redis flag. No manual index step.

### Environment contract

Authoritative source: `packages/config/src/env.ts`. Set all values in the **Coolify env UI — never in the repo**.

| Var                                                                                            | Required?                                                                               | Source                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `REDIS_URL`, `MEILISEARCH_HOST`                                                | Hard (boot fails)                                                                       | Set in compose to internal service URLs                                                                                                                                                                                          |
| `MEILI_MASTER_KEY`, `BETTER_AUTH_SECRET` (≥32), `PIKLO_DB_PASSWORD`                            | Hard                                                                                    | Claude generates (`openssl rand`)                                                                                                                                                                                                |
| `WEB_URL`, `ADMIN_URL`, `API_URL`                                                              | Hard                                                                                    | `https://piklo.com.au` / `https://admin.piklo.com.au` (placeholder) / `https://api.piklo.com.au`                                                                                                                                 |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                                   | Hard                                                                                    | Ben (`sk_test_`); webhook secret is a **bootstrap placeholder** on the first deploy — see "Stripe webhook secret bootstrap" below                                                                                                |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`                                                           | **Build-time** (Hard for checkout)                                                      | Ben (`pk_test_`). NOT a runtime var — Next inlines it at build, so it is a Docker **build ARG** passed via compose `web.build.args`. Without it the image bakes `loadStripe("")` and checkout silently dies. See INF-C1          |
| `NEXT_PUBLIC_POSTHOG_KEY`                                                                      | Build-time (optional)                                                                   | Ben (analytics; safe to omit — build arg with `""` default)                                                                                                                                                                      |
| `STARSHIPIT_API_KEY`, `STARSHIPIT_WEBHOOK_SECRET`                                              | Hard                                                                                    | Ben (sandbox). `STARSHIPIT_WEBHOOK_SECRET` verifies INBOUND webhooks (HMAC-SHA256)                                                                                                                                               |
| `STARSHIPIT_SUBSCRIPTION_KEY`                                                                  | Optional in schema; effectively required for the shipping flow                          | Ben. This is the `Ocp-Apim-Subscription-Key` for **outbound** Starshipit REST calls (label / tracking / address-validate), NOT webhook auth. If the account's API gateway enforces it, outbound calls 403 without it. See INF-M5 |
| `ADMIN_EMAIL`                                                                                  | Optional (defaults to `admin@piklo.com.au`)                                             | Ben. Destination for operator-critical alerts (stuck ops, payout/migration failures). Set it so alerts reach a real inbox without a redeploy. See INF-H2                                                                         |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | Optional in schema; **throws on image-URL build** → effectively required for storefront | Ben (bucket `piklo-media`, public `https://media.piklo.com.au`)                                                                                                                                                                  |
| `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `SENTRY_DSN`                                            | Optional (graceful fallback)                                                            | Ben (skippable for first deploy — mock email / enrichment off / no error tracking)                                                                                                                                               |

`RESEND_API_KEY` is **optional** (mock sender fallback) — earlier docs claiming it hard-fails boot are wrong.

#### Stripe webhook secret bootstrap (chicken-and-egg)

`env.ts` declares `STRIPE_WEBHOOK_SECRET: z.string().min(1)` — hard-required at boot. But the real `whsec_…` value only exists **after** you register a webhook endpoint, which needs the API already live. Break the deadlock with a two-deploy bootstrap:

1. **First deploy:** set `STRIPE_WEBHOOK_SECRET=whsec_placeholder_bootstrap` (any 8+ char string that passes `.min(1)`). The API boots; the webhook handler will reject real Stripe signatures until step 3, which is fine — there are no live charges yet.
2. **Register the endpoint** in the Stripe **test** dashboard (step 5 of the deploy procedure below) and copy the generated `whsec_…`.
3. **Second deploy:** replace `STRIPE_WEBHOOK_SECRET` with the real `whsec_…` in Coolify and redeploy the API (~2-minute downtime). Webhooks now verify.

### Deploy procedure

1. **Coolify resource** — type _Docker Compose_, source = `benobie/piklo-v2`, compose path `infra/docker-compose.prod.yml`, branch `main`. Enter env per the table above. Two gotchas:
   - **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` must be set as a build var** so Coolify forwards it to the `web` build arg — it is baked at image build, not read at runtime. Set it before the first build or the web image ships a dead checkout (INF-C1).
   - **`STRIPE_WEBHOOK_SECRET` starts as `whsec_placeholder_bootstrap`** — the real value comes after step 5 (see "Stripe webhook secret bootstrap" above).
   - _(Optional)_ Set `SENTRY_DSN` now for first-deploy error tracking, and `ADMIN_EMAIL` so operator alerts reach a real inbox. Both are optional but recommended (INF-L3 / INF-H2).
2. **Deploy.** The API entrypoint runs migrations, then starts. If a migration fails the container logs `[entrypoint] !!! MIGRATION_FAILED` and exits; `restart: unless-stopped` relaunches it, so a bad migration becomes a crash-loop — watch for repeated `MIGRATION_FAILED` and tear the stack down rather than leaving it looping (INF-L4). Verify health in-cluster:
   - `GET /health/live` → 200 (always).
   - `GET /health/ready` → 200 (503 if db/redis/stripe down; meili/r2 degraded-not-fatal until first index/image).
   - Confirm MeiliSearch `listings_piklo` index created by the `onReady` bootstrap.
3. **One-time category seed** (storefront taxonomy — NOT on every boot), via Coolify exec on the `api` container:
   ```bash
   pnpm --filter @bushpop/db db:seed:categories
   ```
4. **DNS / origin (fix the 525):**
   - First confirm what owns ports 80/443 on the homelab — Caddy (local-ai-packaged) or Coolify's Traefik — before any DNS cutover (they can't both own the edge).
   - Cloudflare: proxied A records `piklo.com.au`, `www.piklo.com.au`, `api.piklo.com.au` → `154.26.158.150`. Generate a **Cloudflare Origin Certificate** for `piklo.com.au` + `*.piklo.com.au`, install at the edge, set SSL/TLS mode **Full (strict)**. This is the clean 525 fix behind the CF proxy.
   - Verify: `curl -I https://piklo.com.au` → 200; `curl https://api.piklo.com.au/health/ready` → 200.
5. **Stripe webhook (test mode):** register `https://api.piklo.com.au/api/v1/webhooks/stripe` in the Stripe **test** dashboard; subscribe the 8 events (`account.updated`, `payment_intent.{succeeded,requires_action,payment_failed}`, `refund.{created,updated}`, `charge.refunded`, `transfer.updated`); copy the `whsec_` into Coolify `STRIPE_WEBHOOK_SECRET` (replacing `whsec_placeholder_bootstrap`); redeploy the API. This is the second half of the two-deploy bootstrap.

### Verify end-to-end (done-when)

Create a listing (image → R2 → Meili index) → checkout with test card `4242 4242 4242 4242` → `payment_intent.succeeded` webhook processed → order row created.

**Buyer storefront smoke (do this too — it exercises the Stripe publishable-key bake from INF-C1):**

1. **Browse** — open `https://piklo.com.au`, confirm listings render with images (proves R2 public URLs + Meili index).
2. **Search** — run a query; confirm results come back (proves `search-sync` + Meili).
3. **Bag** — add a listing to the bag/cart; confirm it persists across a page reload.
4. **Test charge** — proceed to checkout. **The Stripe payment form must mount** — if it doesn't, the web image was built without `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (INF-C1). Pay with `4242 4242 4242 4242`.
5. **Order** — confirm the order confirmation renders and the `orders` row is created (same as the done-when above).

> ⚠️ **Money-safety:** test mode only. Do NOT switch `STRIPE_SECRET_KEY` to `sk_live_` until the money-safety criticals close.

## Operational Procedures

### Refunds (LIVE — Phase 2B)

Piklo runs Stripe Connect destination charges. Refunds have two code paths depending on whether the platform transfer to the seller has already happened:

1. **Direct refund** — transfer has not yet been released from hold. Refund flows from the platform balance; no reversal needed. Payout hold transitions `held → refunded`.
2. **Refund + reversal** — transfer has been released. Stripe reverses the transfer AND refunds the application fee, both via flags on the same `refunds.create` call. This is the LB-F7-REFUND-FLAGS shipped fix.

**Entry points:**

- `processRefund(orderId, reason)` at [packages/api/src/lib/refund-service.ts:114](packages/api/src/lib/refund-service.ts#L114) — main service function. Branches on payout hold status.
- `handlePaymentAfterExpiry(sessionId, paymentIntentId)` at [packages/api/src/routes/v1/store/checkout/service.ts](packages/api/src/routes/v1/store/checkout/service.ts) — late-success recovery path. Retrieves the latest charge, gates `reverse_transfer` on `transfer_data.destination != null`, gates `refund_application_fee` on `application_fee_amount > 0`. These flags are INDEPENDENT — coupling them skips `reverse_transfer` for zero-fee destination charges and the platform eats the refund.
- Admin-only API: `POST /api/v1/admin/orders/:id/cancel` at [packages/api/src/routes/v1/admin/orders/routes.ts:24](packages/api/src/routes/v1/admin/orders/routes.ts#L24) — operator-initiated cancellation; delegates to `processRefund`.

**WAL (write-ahead log):** Every refund and reversal creates a `payment_operations` row BEFORE the Stripe call. Status flow is `pending → succeeded | failed | indeterminate_5xx`. On Stripe 5xx, the op stays `indeterminate_5xx` and is reconciled by the `reconcile-indeterminate-ops` worker (every 15 min AEST, 1h grace). Never retry an indeterminate op with a new idempotency key — Stripe caches 5xx replays for 24h.

**Webhook reconciliation:** `refund.created`, `refund.updated`, `charge.refunded`, `transfer.updated` all flow through [packages/api/src/routes/v1/webhooks/stripe.ts](packages/api/src/routes/v1/webhooks/stripe.ts) and match against WAL ops by `metadata.piklo_payment_op_id`.

**How to refund an order manually:**

1. Confirm the order state and payout hold status:
   ```sql
   SELECT id, status, stripe_payment_intent_id, stripe_transfer_id FROM orders WHERE id = '<ORDER_ID>';
   SELECT status, frozen_at, hold_policy_applied FROM payout_holds WHERE order_id = '<ORDER_ID>';
   ```
2. If there's no Stripe Dashboard access — hit the admin route:
   ```bash
   curl -X POST https://<api-host>/api/v1/admin/orders/<ORDER_ID>/cancel \
     -H "Cookie: <admin-session>" -H "Content-Type: application/json" \
     -d '{"reason":"buyer_requested"}'
   ```
3. Watch the response. If it returns `409 PAYMENT_IN_RECONCILIATION` the reconciler holds the lock — wait 2 minutes and retry.
4. Verify in Stripe Dashboard that the refund record shows the expected flags:
   - Destination charge: `reverse_transfer: true`, `refund_application_fee: true` (or just `reverse_transfer: true` for zero-fee)
   - Non-Connect charge: neither flag present
5. Verify the `payment_operations` row advanced to `succeeded`:
   ```sql
   SELECT id, type, status, provider_object_id, last_error FROM payment_operations
     WHERE order_id = '<ORDER_ID>' ORDER BY created_at DESC;
   ```

**If an op is stuck in `indeterminate_5xx`:** Wait 15 minutes for the reconciler tick. If still stuck after the 1h grace window AND the reconciler has run, check worker logs for `[reconcile-indeterminate] op <id> still stuck (<N>h old)`. The reconciler looks up the refund/reversal on Stripe and matches by `metadata.piklo_payment_op_id`. If >24h old with no Stripe match, Stripe's idempotency cache has expired — escalation to operator task is TODO (LB-2 / R2 ops console). For now: manually inspect the Stripe Dashboard, create the missing refund/reversal by hand, and mark the WAL op succeeded via SQL.

### Disputes — TODO (Phase 3)

**Not yet implemented.** The `PaymentOperationType` enum at [packages/types/src/commerce.ts](packages/types/src/commerce.ts) reserves `dispute_hold` and `dispute_release` but no code creates them. [packages/api/src/lib/payout-hold-service.ts](packages/api/src/lib/payout-hold-service.ts) exports `freezePayoutHold(orderId)` as a forward-looking helper but it has no caller.

The Stripe webhook handler at [packages/api/src/routes/v1/webhooks/stripe.ts](packages/api/src/routes/v1/webhooks/stripe.ts) does NOT subscribe to `charge.dispute_created`, `charge.dispute_updated`, `charge.dispute_closed`, or `charge.dispute_funds_reinstated`. Any dispute received on the Stripe account today will flow to the default Stripe dashboard with no piklo-side state change.

**Interim procedure:** Operator must handle disputes manually via the Stripe Dashboard. Submit evidence through Stripe UI; piklo order and payout_hold records will need manual SQL updates to reflect dispute state once it ships.

### Label Voiding (Starshipit) — TODO (Phase 2A)

**Not yet implemented.** [packages/api/src/lib/shipping/starshipit.ts](packages/api/src/lib/shipping/starshipit.ts) exposes `createShipment`, `getTrackingStatus`, and `validateAddress`. There is no `voidLabel` / `cancelLabel` function, no admin route, and no `labelVoidedAt` column on `orders`. The `shipping-label` worker and `starshipit-poll` worker both treat labels as create-once, read-tracking-only.

**Interim procedure:** Operators void labels directly in the Starshipit portal. Order records continue to reference the now-invalid `shipping_label_id` — there is no piklo-side "label cancelled" state. If the order should not ship after a label void, use the admin cancel route (refund path) to move the order to `cancelled`.

### Payout Release (LIVE eligibility logic, TODO scheduler — Phase 2B)

**What's built:** [packages/api/src/lib/payout-hold-service.ts](packages/api/src/lib/payout-hold-service.ts) owns the hold state machine + eligibility calculation.

**Policy tiers** (at `evaluateHoldPolicy()` lines 152–195):

| Tier              | Release delay               | Applies when                                                                          |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| `buyer_confirmed` | immediate                   | Buyer marks the order as received                                                     |
| `tracked_3d`      | delivery + 3 days           | Tracking is active AND seller has ≥5 completed orders AND seller profile ≥30 days old |
| `new_seller_7d`   | delivery + 7 days           | Seller has <5 completed orders OR seller profile <30 days old                         |
| `untracked_10bd`  | delivery + 14 calendar days | No tracking available                                                                 |

**Cash reserve gate:** Before releasing any payout, `getPlatformBalance()` checks Stripe available AUD balance against `max($500, 2× highest single order in last 30 days)`. Under this threshold, release is blocked — the operator must manually top up or wait.

**State machine** (from `commerce-machines.ts`):

```
held → releasing | refunded | blocked | release_failed_retryable
releasing → released | refunded | blocked | release_failed_retryable
release_failed_retryable → releasing | release_failed_manual | refunded
(released, refunded, blocked, release_failed_manual are terminal)
```

**What's NOT built:** There is no scheduled worker that walks eligible holds and executes `stripe.transfers.create`. The release execution path is Sprint 1b Phase 2B scope. In practice today, no money moves to sellers automatically; the hold state machine only tracks what SHOULD happen.

**How to inspect payout holds:**

```sql
-- All holds for an order
SELECT status, hold_policy_applied, frozen_at, buyer_confirmed_at,
       delivery_confirmed_at, next_retry_at, failure_reason
  FROM payout_holds WHERE order_id = '<ORDER_ID>';

-- Every hold eligible for release today (once scheduler ships)
SELECT oh.order_id, oh.hold_policy_applied, o.delivered_at
  FROM payout_holds oh JOIN orders o ON o.id = oh.order_id
  WHERE oh.status = 'held'
    AND o.status IN ('delivered','buyer_confirmed');
```

**How to manually release a hold (only if absolutely necessary before the scheduler ships):**

1. Confirm the hold is in `held` and the delay policy has elapsed.
2. Check the platform balance manually in the Stripe Dashboard — confirm > $500 AUD and > 2× the largest recent order.
3. Create the transfer manually in the Stripe Dashboard (Connect → Transfers → New).
4. Update the DB row with SQL to reflect the terminal state:
   ```sql
   UPDATE payout_holds SET status='released', updated_at=now()
     WHERE order_id = '<ORDER_ID>' AND status='held';
   ```
5. Log the action in an operator note — there is no audit table for manual overrides yet.

### Stripe Dashboard Actions (LIVE reference — Phase 2A)

Piklo subscribes to these Stripe webhook events (see [packages/api/src/routes/v1/webhooks/stripe.ts](packages/api/src/routes/v1/webhooks/stripe.ts) for handlers):

| Event                               | Handler action                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `account.updated`                   | Syncs seller Stripe Connect status (`charges_enabled`, `payouts_enabled`, `details_submitted`)                    |
| `payment_intent.succeeded`          | Creates order, marks inventory sold, sends confirmation email, enqueues shipping label job                        |
| `payment_intent.requires_action`    | 3DS/SCA handling — session stays in `requires_action`, buyer completes auth                                       |
| `payment_intent.payment_failed`     | Cleanup — cancels PI, releases inventory reservation                                                              |
| `refund.created` + `refund.updated` | Reconciles refund WAL ops via `metadata.piklo_payment_op_id`                                                      |
| `charge.refunded`                   | Iterates attached refunds and reconciles any with matching metadata                                               |
| `transfer.updated`                  | Reconciles transfer reversals (Stripe does not emit `transfer.reversal.created`; walks expanded `reversals.data`) |

Events NOT subscribed (will land in Stripe Dashboard inbox with no piklo-side effect):

- `charge.dispute_created`, `charge.dispute_updated`, `charge.dispute_closed`, `charge.dispute_funds_reinstated` (Phase 3)
- `payout.paid`, `payout.failed` (Piklo payouts are manual transfers, not Stripe automatic payouts — events are unused)

**Common operator actions in Stripe Dashboard:**

1. **Inspect a charge's refund state** — Dashboard → Payments → filter by `metadata.piklo_checkout_session_id = <id>` → open charge → Refunds tab. Cross-reference with `SELECT * FROM payment_operations WHERE order_id = <id>`.
2. **Issue a manual refund** — avoid. Use the admin cancel route so the WAL op is created and the reconciler can match. If you MUST refund via Dashboard, add `metadata.piklo_payment_op_id` pointing at a pre-created WAL op row, otherwise the reconciler cannot link the refund back to piklo state.
3. **Cancel a PaymentIntent** — only via Dashboard if piklo's normal cancel path is broken. Manually transition the `checkout_sessions` row to `expired` or `cancelled` afterwards.
4. **Respond to a dispute** — 100% manual until Phase 3. Upload evidence in Stripe Dashboard. Piklo has no dispute inbox.

## Workers Runbook

Quick reference for the BullMQ workers registered in [packages/api/src/workers/index.ts](packages/api/src/workers/index.ts):

| Worker                        | Schedule              | Purpose                                                                                                                                                                      |
| ----------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image-cleanup`               | on-demand             | Removes orphaned R2 upload staging objects                                                                                                                                   |
| `enrichment`                  | on-demand             | Legacy AI enrichment (ANTHROPIC_API_KEY gated; auto-enqueue disabled 03/07 PR #27)                                                                                           |
| `image-variants`              | on-demand             | thumb-320/card-800/pdp-1600 WebP + EXIF strip on every image confirm (always-on)                                                                                             |
| `ai-draft`                    | on-demand             | Sell-flow AI listing drafts — Gemini primary, Haiku escalation (GEMINI_API_KEY \|\| ANTHROPIC_API_KEY)                                                                        |
| `checkout-expiry`             | on-demand             | Expires `checkout_sessions` past their TTL                                                                                                                                   |
| `shipping-label`              | on-demand             | Creates Starshipit labels                                                                                                                                                    |
| `email`                       | on-demand             | Sends notification emails                                                                                                                                                    |
| `event-consumer`              | on-demand             | Processes marketplace event log                                                                                                                                              |
| `search-sync`                 | on-demand             | Syncs listings to MeiliSearch                                                                                                                                                |
| `notification-sweeper`        | on-demand             | Re-enqueues stale pending notifications                                                                                                                                      |
| `listing-score`               | on-demand             | Scores listing quality, emits nudges                                                                                                                                         |
| `refund`                      | on-demand             | (Queue wired, no caller yet — `refundQueue.add()` unused in live code)                                                                                                       |
| `starshipit-poll`             | 9:20am AEST daily     | Polls tracking status for shipped orders                                                                                                                                     |
| `reconcile-indeterminate-ops` | **every 15 min AEST** | Reconciles WAL ops stuck in `indeterminate_5xx` by matching against Stripe refunds/reversals. See "Refunds" section above. (Shipped 2026-04-11 via hotfix PR #11)            |
| `order-jobs-sweeper`          | repeatable            | Re-enqueues downstream jobs for orders where `jobs_enqueued_at IS NULL` — closes the AUDIT-010 crash window. (Shipped PR #27)                                                |
| `payout-release`              | repeatable (gated)    | Releases payout holds via Stripe transfer once the hold window passes. Only registered when `PAYOUT_RELEASE_ENABLED=true` (off by default, live-key guard). (Shipped PR #27) |
| `backfill-aspect-ratios`      | repeatable            | Backfills `aspect_ratio` on image rows missing it (Sprint 1a review fix).                                                                                                    |

**Verify the reconciler is running** (local dev):

```bash
# Boot the api and grep for the registration logs
pnpm -F @bushpop/api dev 2>&1 | grep -E "reconcile|Reconcile"
# Expect:
#   [reconcile-indeterminate] Repeatable job scheduled (every 15 min AEST)
#   [workers] Reconcile indeterminate ops worker started
```

## Pre-flight checks before risky ops changes

Before any operator action that moves money, voids a label, or touches payout state, confirm:

1. **DB backup is fresh** — run the manual pg_dump above.
2. **Stripe test mode or live mode?** — `grep STRIPE_SECRET_KEY .env` and confirm prefix (`sk_test_` vs `sk_live_`).
3. **Reconciler is healthy** — check worker logs for recent `[reconcile-indeterminate] scanned=N` entries; N should be small single digits under normal load.
4. **No in-flight indeterminate ops** —
   ```sql
   SELECT id, type, status, created_at FROM payment_operations
     WHERE status = 'indeterminate_5xx' ORDER BY created_at DESC;
   ```
   If this returns rows older than 1 hour, investigate BEFORE taking any action that creates new ops.
