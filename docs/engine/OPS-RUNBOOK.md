> **Provenance:** engine doc copied from `benobie/piklo-v2` @ `2419a38` at fork time (02/07/2026), with `@piklo/*` renamed `@bushpop/*`. May drift from upstream — see `docs/engine/FORK.md`.

# Operations Runbook

Operational procedures for the bushpop-v2 engine. "LIVE" sections describe procedures backed by shipped code. "TODO" sections describe work that is specified but not yet built — do not attempt the procedure, the code path does not exist.

## Local Development

### Start services

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

### Stop services

```bash
docker compose -f infra/docker-compose.dev.yml down
```

### Reset database

```bash
docker compose -f infra/docker-compose.dev.yml down -v  # removes volumes
docker compose -f infra/docker-compose.dev.yml up -d
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
docker compose -f infra/docker-compose.dev.yml down -v
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate && pnpm db:seed
```

This destroys local data. If you need to preserve data, export it first with the pg_dump procedure below.

## Backup & Restore

### Manual database backup (LIVE — Phase 0 automated script still TODO)

```bash
# Snapshot the local container DB to a timestamped file
mkdir -p ~/backups/bushpop-v2
docker exec bushpop-db pg_dump -U bushpop -d bushpop --clean --if-exists \
  > ~/backups/bushpop-v2/bushpop-$(date +%Y-%m-%d-%H%M).sql
ls -lh ~/backups/bushpop-v2/ | tail -5
```

The `--clean --if-exists` flags make the dump self-contained — restoring it will drop and recreate each object.

### Manual database restore

```bash
# Restore from a timestamped snapshot (destructive)
cat ~/backups/bushpop-v2/bushpop-YYYY-MM-DD-HHMM.sql | \
  docker exec -i bushpop-db psql -U bushpop -d bushpop
```

### Staging backup — TODO

No automated pg_dump schedule, no volume snapshots, no off-host replication. The engine staging stack (below) keeps backups manual via the `pg_dump`/restore procedure above (run against the `bushpop-db` container on the homelab, exec'd through Coolify). Managed Postgres + automated backups is a pre-GMV follow-up.

## Engine Staging Deploy (Coolify on homelab)

> **Rewritten 04/07/2026 for the bushpop-v2 fork** — the section below described upstream piklo-v2's first production deploy to `piklo.com.au`. That never applied here. Bushpop's engine deploy has been **LIVE on staging since 03/07/2026**; production `bushpop.com.au` stays on WordPress until the separate DNS cutover (business doc, not this repo). Authoritative source for everything below: `.claude/CLAUDE.md` §Deploy.

Coolify app **`bushpop-engine`** (uuid `w1be995ronuhl7092d4jr392`) on the homelab VPS (`coolify.bushpop.xyz`, host `154.26.158.150`), source `benobie/bushpop-v2` via deploy key, base directory `/infra`, compose file `infra/docker-compose.engine.prod.yml` (5 services: `bushpop-db`, `bushpop-redis`, `bushpop-meilisearch`, `api`, `web`), tracking `main`, test-mode Stripe.

**Deploys are API-triggered, not push-triggered:** Coolify does NOT redeploy automatically when `main` moves — you (or a script) must call `POST /api/v1/deploy?uuid=w1be995ronuhl7092d4jr392` against the Coolify API. Nothing in `.github/workflows/` ships the engine; `deploy.yml` only ever touches the content site (`apps/web` → Cloudflare Pages).

### Architecture decisions (ported from upstream, still true)

- **Single Coolify Docker-Compose stack**, one internal network. Build context = repo root.
- **API runs `tsx src/index.ts`, NOT `node dist`.** `@bushpop/config`/`@bushpop/types`/`@bushpop/db` export raw `./src/index.ts` and config/types have no build script, so a compiled `dist` can't resolve workspace imports at runtime. The prod image therefore keeps dev deps (`tsx` + `drizzle-kit`). **Image-size trade-off (INF-M1):** because those are runtime-required, a `--prod` install is NOT an option (it would drop `tsx`/`drizzle-kit` and break boot), so the image carries the full dev toolchain (vitest, tsc, etc.) — ~400MB heavier + wider attack surface. The only safe slim is bundling the API with tsup (`noExternal: [/@bushpop/]`, native deps external) for a real `node dist` artifact; deferred as pre-GMV hardening.
- **Containers run as non-root (`USER node`, uid 1000)** in both Dockerfiles (INF-H1). The API's `node_modules`/pnpm store stay root-owned but world-readable, so `tsx`/`drizzle-kit` execute fine without a costly `chown -R` of the dep tree.
- **Healthchecks: liveness for restarts, readiness for monitoring (INF-L1/L2).** Both container `HEALTHCHECK`s probe `/health/live` (or `/` for web) — they decide container restart, so they must NOT depend on external services. A Stripe/Meili/R2 outage must not restart the API. Use `/health/ready` (checks db/redis/stripe, returns 503 on critical-dep down) for external monitoring/alerting only — never as a restart gate. `web` gates on the api container being healthy (`/health/live`), which only passes after migrate-on-boot completes, so web never serves before migrations finish. **Healthchecks probe `127.0.0.1`, never `localhost`** (PR #41) — busybox `wget` in the alpine images resolves `localhost` to `::1` first and these containers only bind IPv4, so a `localhost` healthcheck hangs/fails even when the service is up.
- **Migrate-on-boot:** `packages/api/docker-entrypoint.sh` runs `pnpm --filter @bushpop/db db:migrate` (24 migrations, `0000`–`0023`) before exec'ing the server. Single replica → no migration race.
- **Workers are in-process** — one `api` container runs Fastify + all 17 BullMQ workers (full list: `docs/engine/workers.md`). No separate worker service.
- **MeiliSearch self-bootstraps** the `listings_piklo` index on the Fastify `onReady` hook behind a versioned Redis flag. No manual index step. (Index name is the pre-fork upstream name — a deliberate data-migration item, not a branding miss; see §7 of `docs/HANDOFF-ZERO-CONTEXT.md`.)

### Environment contract

Authoritative source: `packages/config/src/env.ts`. Values are set in the **Coolify env UI**, but read `infra/docker-compose.engine.prod.yml` first — **Coolify re-syncs every env var from that compose file's default on EVERY deploy** (PR #43). That means the UI is not a safe place to override anything the compose file gives a non-empty default:

| Compose shape | Behaviour | Vars |
| --- | --- | --- |
| `${VAR}` — no default | Coolify UI value survives deploys (nothing to reset to). This is where real secrets belong. | `BUSHPOP_DB_PASSWORD`, `MEILI_MASTER_KEY`, `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STARSHIPIT_API_KEY`, `STARSHIPIT_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (build arg) |
| `${VAR:-realvalue}` — non-empty default | **Clobbered back to the compose default on every deploy.** To change one of these, edit the compose file and redeploy — a Coolify UI edit will not stick. | `WEB_URL` (`https://market.bushpop.xyz`), `ADMIN_URL` (`https://admin.bushpop.xyz`), `API_URL` (`https://api.bushpop.xyz`), `CHANNEL_SLUG` (`bushpop`), `R2_BUCKET_NAME` (`bushpop-images`), `R2_PUBLIC_URL` (the r2.dev pub URL below), `ADMIN_EMAIL` (`admin@bushpop.com.au`) |
| `${VAR:-}` — empty-string default | Coolify UI value survives (default is empty), but **`validateEnv` treats `""` as unset** (PR #42) — so an unset one silently behaves as "not configured", never as an observable empty string. | `STARSHIPIT_SUBSCRIPTION_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY` (build arg), `NEXT_PUBLIC_CHATWOOT_BASE_URL` (build arg), `NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN` (build arg) |
| `DATABASE_URL`, `REDIS_URL`, `MEILISEARCH_HOST` | Hardcoded in compose to internal service DNS names (`bushpop-db`/`bushpop-redis`/`bushpop-meilisearch`) — not Coolify-editable at all, by design. | — |

Notes on specific vars:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `R2_PUBLIC_URL` are **build-time** — Next/Docker bake them into the image, so they're passed as `web.build.args` in compose, not read at runtime. Without the Stripe key the image bakes `loadStripe("")` and checkout silently dies (INF-C1); this is already wired and baked on staging (04/07).
- `R2_PUBLIC_URL` currently defaults to the bucket's r2.dev public URL (`https://pub-3c7f819593c94086b71e9663605d4c11.r2.dev`, bucket `bushpop-images`) — **NOT** `bushpop-media`. At cutover, swap the `web` and `api` compose defaults to the custom domain `media.bushpop.com.au` and attach it to the R2 bucket.
- `STRIPE_WEBHOOK_SECRET` is a **placeholder** on staging today, pending Phase 5 (queue item 2 in `docs/HANDOFF-ZERO-CONTEXT.md` §10) — real Stripe test key is already wired for the PaymentIntent leg, but webhook signatures won't verify until a real `whsec_…` replaces the placeholder.
- `RESEND_API_KEY` is **optional** (mock sender fallback) — earlier docs claiming it hard-fails boot are wrong. Resend is live-verified on staging (sends as `noreply@bushpop.com.au`).
- `NEXT_PUBLIC_CHATWOOT_BASE_URL` / `NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN` are **build-time**, same mechanism as the Stripe/PostHog keys above — the widget (`apps/market/src/components/chatwoot-widget.tsx`) no-ops unless both are set. Dormant on staging as of 08/07; activation steps + the real values pointer are in `docs/support-widget.md`.

### Deploy procedure

1. **Change compose-default env values by editing the compose file**, not the Coolify UI (see table above) — commit + push, then trigger a deploy.
2. **Trigger the deploy** via the Coolify API: `POST /api/v1/deploy?uuid=w1be995ronuhl7092d4jr392` (Coolify API token required). The API entrypoint runs migrations, then starts. If a migration fails the container logs `[entrypoint] !!! MIGRATION_FAILED` and exits; `restart: unless-stopped` relaunches it, so a bad migration becomes a crash-loop — watch for repeated `MIGRATION_FAILED` and tear the stack down rather than leaving it looping (INF-L4).
3. **Verify health** (probe `127.0.0.1` if checking in-container, the public hostname otherwise):
   - `GET https://api.bushpop.xyz/health/live` → 200 (always).
   - `GET https://api.bushpop.xyz/health/ready` → 200 (503 if db/redis/stripe down; meili/r2 degraded-not-fatal until first index/image). All green as at 03/07.
   - Confirm MeiliSearch `listings_piklo` index created by the `onReady` bootstrap.
4. **Seeding is manual, not automatic on boot**, via Coolify exec (or `docker exec`) on the `api` container:
   ```bash
   docker exec <api-container> pnpm --filter @bushpop/db db:seed
   docker exec <api-container> pnpm --filter @bushpop/db db:seed:categories
   ```
   **Seeding does not index into MeiliSearch** — `search-sync` is event-driven off writes, so a fresh reseed needs a separate backfill to populate the index:
   ```bash
   docker exec <api-container> pnpm --filter @bushpop/api search:reindex
   ```
   (`packages/api/src/scripts/reindex-search.ts`, added PR #78 05/07 — rebuilds MeiliSearch from Postgres for every seeded channel; previously this required an ad-hoc re-trigger with no dedicated script.) 6 fixtures were seeded + Meili-indexed as at 03/07; categories backfilled + reindexed 05/07 (PR #78).
5. **DNS / origin:** Coolify's Traefik is disabled on this homelab — **Caddy fronts everything**, so the compose file publishes host ports for Caddy to reach directly: `market.bushpop.xyz` → `:3210`, `api.bushpop.xyz` → `:3334` (see the header comment in `infra/docker-compose.engine.prod.yml`). No Cloudflare Origin Certificate / Traefik labels needed for this stack.
   - Verify: `curl -I https://market.bushpop.xyz` → 200; `curl https://api.bushpop.xyz/health/ready` → 200.
6. **Stripe webhook (test mode) — outstanding, Phase 5:** register `https://api.bushpop.xyz/api/v1/webhooks/stripe` in the Stripe **test** dashboard; subscribe the 8 events (`account.updated`, `payment_intent.{succeeded,requires_action,payment_failed}`, `refund.{created,updated}`, `charge.refunded`, `transfer.updated`); copy the `whsec_` into the compose file's `STRIPE_WEBHOOK_SECRET` default (or set it directly in Coolify — this var has no compose default, so a UI-set value survives); redeploy the API.

### Verify end-to-end (done-when)

Create a listing (image → R2 → Meili index) → checkout with test card `4242 4242 4242 4242` → `payment_intent.succeeded` webhook processed → order row created. **Blocked today on step 6 above** (webhook secret still a placeholder) — the current verified end of the live trace is the PaymentIntent leg (`docs/HANDOFF-ZERO-CONTEXT.md` §3 item 4).

**Buyer storefront smoke (do this too — it exercises the Stripe publishable-key bake from INF-C1):**

1. **Browse** — open `https://market.bushpop.xyz`, confirm listings render with images (proves R2 public URLs + Meili index).
2. **Search** — run a query; confirm results come back (proves `search-sync` + Meili).
3. **Bag** — add a listing to the bag/cart; confirm it persists across a page reload.
4. **Test charge** — proceed to checkout. **The Stripe payment form must mount** — if it doesn't, the web image was built without `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (INF-C1). Pay with `4242 4242 4242 4242`.
5. **Order** — confirm the order confirmation renders and the `orders` row is created (blocked until step 6 above lands a real webhook secret).

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
