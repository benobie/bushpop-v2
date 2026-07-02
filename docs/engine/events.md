> **Provenance:** engine doc copied from `benobie/piklo-v2` @ `2419a38` at fork time (02/07/2026), with `@bushpop/*` renamed `@bushpop/*`. May drift from upstream — see `docs/engine/FORK.md`.

---
last-verified: 2026-05-03
source-of-truth: packages/api/src/lib/events.ts + every dispatchEvent() call site
---

# Event Catalogue

Reference for every marketplace event currently emitted. The dispatcher is small ([`packages/api/src/lib/events.ts`](../packages/api/src/lib/events.ts) — ~70 LOC); the taxonomy lives in the call sites. Rebuild this doc by grepping `dispatchEvent(` across `packages/api/src/`.

## Envelope and persistence

```ts
interface DispatchEventInput {
  eventName: string;          // ad-hoc string — there is no per-event registry yet
  category: string;           // see "Categories observed in code" below
  actorId?: string;
  entityType?: string;
  entityId?: string;
  channelId?: string;
  metadata?: Record<string, unknown>;
}
```

`dispatchEvent()` does three things, in order:

1. **Insert** a `marketplace_events` row with `delivery_status="pending"` (audit log; see `packages/db/src/schema/events.ts`).
2. **Enqueue** to the `marketplace-events` BullMQ queue, job name = `eventName`, payload = the input + `eventId`.
3. **Update** the row to `delivery_status="dispatched"` if enqueue succeeded. Failure is logged, not thrown — daily re-index is the safety net.

The `event-consumer` worker drains the queue, marks each row `delivered`, and runs [side effects](workers.md#event-consumer-handler-registry). Indexing fan-out goes to a **separate** `search-sync` queue (not back into `marketplace-events`).

## Shared schema reality vs. emitter reality

[`packages/types/src/marketplace-events.ts`](../packages/types/src/marketplace-events.ts) defines:

- `EVENT_CATEGORIES = ["auth", "user", "listing", "inventory", "order", "payment", "shipping", "dispute", "admin", "system"]`
- `DELIVERY_STATUSES = ["pending", "dispatched", "failed"]`
- `marketplaceEventSchema` + `dispatchEventSchema` (envelope only — no per-event-name registry)

But `dispatchEvent()` in `lib/events.ts` re-declares a local `DispatchEventInput` with `category: string` (untyped) and never imports `dispatchEventSchema`. So the runtime accepts categories the shared schema rejects, and the consumer writes `"delivered"` (a status the shared schema does not list).

Categories actually emitted by current code:

- `inventory` (8 events) — used for both inventory_item lifecycle and inventory reserve/release/enrich
- `listings` (4 events) — `channel_listing.*` from seller services
- `listing` (2 events) — `channel_listing.status_changed` cascade paths and `listing.visibility_changed`
- `profiles` (1 event) — `seller_profile.updated`
- `order` (5 events)
- `payment` (2 events)
- `payout` (1 event)

`auth`, `user`, `shipping`, `dispute`, `admin`, `system` are defined in the shared enum but no current emitter uses them.

## Events by domain

22 distinct event names are referenced in the code (21 emitted; `order.delivered` has a consumer handler but no producer yet). Anchors are slug-style (lowercase, dots removed) so `workers.md` can deep-link.

### Commerce / Checkout

#### `inventory.reserved`

| | |
| --- | --- |
| Category | `inventory` |
| Producer | [`routes/v1/store/checkout/service.ts`](../packages/api/src/routes/v1/store/checkout/service.ts) `initiateCheckout()` |
| Consumer | audit-only (no event-consumer handler) |
| Entity | `entityType="checkout_session"`, `entityId=sessionId` |
| Actor | `actorId=buyerId` |
| Channel | yes |
| Metadata | `{ inventoryItemIds: ULID[] }` |
| Why | Audit trail for "this checkout is holding these items" — pairs with `inventory.released` |

#### `inventory.released`

| | |
| --- | --- |
| Category | `inventory` |
| Producers | `cancelCheckoutSession()` and `expireCheckoutSession()` in `routes/v1/store/checkout/service.ts`; Stripe webhook `handlePaymentIntentFailed()` |
| Consumer | audit-only |
| Entity | `entityType="checkout_session"`, `entityId=sessionId` |
| Actor | `actorId=buyerId` on buyer-cancel; absent on expiry/payment-failure |
| Channel | yes |
| Metadata | `{ inventoryItemIds: ULID[], reason: "buyer_cancelled" \| "session_expired" \| "payment_failed" }` |
| Why | Counterpart to `inventory.reserved` — stops a future "what released this item" forensic question |

### Inventory

#### `inventory_item.created`

| | |
| --- | --- |
| Category | `inventory` |
| Producer | [`routes/v1/seller/inventory/service.ts`](../packages/api/src/routes/v1/seller/inventory/service.ts) `createInventoryItem()` |
| Consumer | audit-only |
| Entity | `entityType="inventory_item"`, `entityId=item.id` |
| Actor | `actorId=ownerId` |
| Channel | no |
| Metadata | none |
| Why | Audit when a seller's inventory grows |

#### `inventory_item.lifecycle_changed`

| | |
| --- | --- |
| Category | `inventory` |
| Producer | `routes/v1/seller/inventory/service.ts` `transitionLifecycle()` |
| Consumer | audit-only |
| Entity | `entityType="inventory_item"`, `entityId=item.id` |
| Actor | `actorId=ownerId` |
| Channel | no |
| Metadata | `{ from: LifecycleState, to: LifecycleState }` |
| Why | State-machine audit — `for_sale → owned`, etc. |

#### `inventory_item.archived`

| | |
| --- | --- |
| Category | `inventory` |
| Producer | `routes/v1/seller/inventory/service.ts` `archiveInventoryItem()` |
| Consumer | audit-only |
| Entity | `entityType="inventory_item"`, `entityId=item.id` |
| Actor | `actorId=ownerId` |
| Channel | no |
| Metadata | none |
| Why | Permanent end-of-life signal — distinct from lifecycle transitions |

#### `inventory.enriched`

| | |
| --- | --- |
| Category | `inventory` |
| Producer | [`workers/enrichment.ts`](../packages/api/src/workers/enrichment.ts) `processEnrichmentJob()` |
| Consumer | audit-only |
| Entity | `entityType="inventory_item"`, `entityId=inventoryItemId` |
| Actor | none |
| Channel | none |
| Metadata | `{ promptVersion: string, model: string, confidence: number }` |
| Why | Marker for "Claude finished enriching this item" — used for analytics + debugging the AI pipeline |

### Listings

#### `channel_listing.created`

| | |
| --- | --- |
| Category | `listings` |
| Producer | [`routes/v1/seller/listings/service.ts`](../packages/api/src/routes/v1/seller/listings/service.ts) `createListing()` |
| Consumer | `event-consumer` → fans to `search-sync` (index) and `listing-score` (compute) |
| Entity | `entityType="channel_listing"`, `entityId=listing.id` |
| Actor | `actorId=ownerId` |
| Channel | yes |
| Metadata | none |
| Why | New listing must be indexed and quality-scored |

#### `channel_listing.content_changed`

| | |
| --- | --- |
| Category | `listings` |
| Producers | `routes/v1/seller/{listings,inventory,images}/service.ts`; also `workers/enrichment.ts` |
| Consumer | `event-consumer` → fans to `search-sync` and `listing-score` |
| Entity | `entityType="channel_listing"`, `entityId=listing.id` |
| Actor | `actorId=ownerId` (route paths); none (enrichment worker) |
| Channel | yes |
| Metadata | none |
| Why | Title / description / images / canonical fields changed — re-rank and re-index |

#### `channel_listing.status_changed`

| | |
| --- | --- |
| Category | `listings` (seller path) or `listing` (cascade paths) |
| Producers | seller `transitionListingStatus()`; `cascadeLifecycleToListings()` and `cascadeImageDeletionToListings()` in [`lib/inventory-invariants.ts`](../packages/api/src/lib/inventory-invariants.ts) |
| Consumer | `event-consumer` → fans to `search-sync` |
| Entity | `entityType="channel_listing"`, `entityId=listing.id` |
| Actor | `actorId=ownerId` on seller path; absent on cascade paths |
| Channel | yes |
| Metadata | seller path: `{ from, to }`. Lifecycle cascade: `{ from, to: "paused" \| "archived" \| "sold", trigger: "lifecycle_cascade" }`. Image-deletion cascade: `{ from: "active", to: "paused", trigger: "image_deletion_cascade" }` |
| Why | `draft → active`, `active → paused`, etc. — index must reflect visibility |

#### `channel_listing.archived`

| | |
| --- | --- |
| Category | `listings` |
| Producer | `routes/v1/seller/listings/service.ts` `archiveListing()` |
| Consumer | `event-consumer` → fans to `search-sync` (delete from index) |
| Entity | `entityType="channel_listing"`, `entityId=listing.id` |
| Actor | `actorId=ownerId` |
| Channel | yes |
| Metadata | none |
| Why | Listing permanently archived — distinct from `paused` (which is reversible) |

#### `listing.visibility_changed`

| | |
| --- | --- |
| Category | `listing` |
| Producer | [`routes/v1/admin/reports/service.ts`](../packages/api/src/routes/v1/admin/reports/service.ts) `patchReport()` |
| Consumer | `event-consumer` → fans to `search-sync` |
| Entity | `entityType="channel_listing"`, `entityId=listing.id` |
| Actor | admin `actorId` |
| Channel | yes |
| Metadata | `{ reportId, previousStatus, newStatus, hidden }` |
| Why | Moderation-driven visibility flip — must surface in search results immediately |

#### `listing_score.calculated`

| | |
| --- | --- |
| Category | `listings` |
| Producer | [`workers/listing-score.ts`](../packages/api/src/workers/listing-score.ts) `processListingScoreJob()` |
| Consumer | `event-consumer` → fans to `search-sync` |
| Entity | `entityType="channel_listing"`, `entityId=listingId` |
| Actor | none |
| Channel | none |
| Metadata | `{ score, photoScore, descriptionScore, completenessScore, categoryScore, qualityTier, nudgeKey }` |
| Why | Quality score affects MeiliSearch ranking — re-index on change |

#### `seller_profile.updated`

| | |
| --- | --- |
| Category | `profiles` |
| Producer | [`routes/v1/seller/profile/service.ts`](../packages/api/src/routes/v1/seller/profile/service.ts) `patchSellerProfile()` (when search-relevant fields change) and `confirmAvatarUpload()` |
| Consumer | `event-consumer` → fans to `search-sync` (re-indexes every active listing for the seller) |
| Entity | `entityType="seller_profile"`, `entityId=userId` |
| Actor | `actorId=userId` |
| Channel | none |
| Metadata | none |
| Why | Store name / avatar / handle appear on listing cards — must propagate to every active listing in the index |

### Order

#### `order.created`

| | |
| --- | --- |
| Category | `order` |
| Producer | [`routes/v1/webhooks/stripe.ts`](../packages/api/src/routes/v1/webhooks/stripe.ts) `handlePaymentIntentSucceeded()` |
| Consumer | audit-only (the actual fulfilment work — label + emails — is enqueued directly by `enqueueOrderJobs()` alongside the dispatch) |
| Entity | `entityType="order"`, `entityId=orderId` |
| Actor | `actorId=session.buyerId` |
| Channel | yes |
| Metadata | `{ checkoutSessionId: ULID }` |
| Why | Audit + analytics anchor for "an order exists" |

#### `order.shipped`

| | |
| --- | --- |
| Category | `order` |
| Producer | [`routes/v1/seller/orders/service.ts`](../packages/api/src/routes/v1/seller/orders/service.ts) `markOrderShipped()` |
| Consumer | `event-consumer` → `enqueueEmail({ type: "shipping_confirmation_buyer", orderId })` |
| Entity | `entityType="order"`, `entityId=orderId` |
| Actor | `actorId=sellerId` |
| Channel | yes |
| Metadata | `{ trackingNumber: string, carrier: string }` |
| Why | Notify the buyer with tracking |

#### `order.delivered`

| | |
| --- | --- |
| Category | `order` |
| Producer | **None yet.** Handler exists in `event-consumer.ts` (logs only) — full hold-policy evaluation deferred to a future step (see source comment "Step 4"). The `starshipit-poll` worker currently performs the delivery transition + hold evaluation directly without dispatching this event |
| Consumer | `event-consumer` log handler (placeholder) |
| Entity | `entityType="order"`, `entityId=orderId` |
| Actor | none |
| Channel | none |
| Metadata | `{ orderId }` (when wired) |
| Why | Future hook for analytics + customer surveys + payout-hold evaluation when delivery is centralised on events |

#### `order.tracking_exception`

| | |
| --- | --- |
| Category | `order` |
| Producers | [`routes/v1/webhooks/starshipit.ts`](../packages/api/src/routes/v1/webhooks/starshipit.ts) `handleTrackingEvent()`; [`workers/starshipit-poll.ts`](../packages/api/src/workers/starshipit-poll.ts) on `exception` status |
| Consumer | `event-consumer` → `enqueueEmail({ type: "tracking_exception_admin", orderId })` |
| Entity | `entityType="order"`, `entityId=orderId` |
| Actor | none |
| Channel | yes (webhook path); none (poll path) |
| Metadata | `{ orderId, trackingNumber, status, statusDescription }` |
| Why | Lost / damaged / returned shipment — admin needs to investigate |

#### `order.tracking_stale`

| | |
| --- | --- |
| Category | `order` |
| Producer | `workers/starshipit-poll.ts` — when shipped > 14 days with no delivery confirmation |
| Consumer | audit-only |
| Entity | `entityType="order"`, `entityId=orderId` |
| Actor | none |
| Channel | none |
| Metadata | `{ orderId, trackingNumber, daysSinceCreated }` |
| Why | Dead-letter signal so ops sees long-tail shipments without spamming the admin email |

#### `order.cancelled`

| | |
| --- | --- |
| Category | `order` |
| Producer | [`routes/v1/admin/orders/routes.ts`](../packages/api/src/routes/v1/admin/orders/routes.ts) admin cancel endpoint |
| Consumer | audit-only |
| Entity | `entityType="order"`, `entityId=orderId` |
| Actor | admin `actorId` |
| Channel | yes |
| Metadata | `{ refundId: string \| null, cancelledBy: "admin", reason }` |
| Why | Distinguishes admin-initiated cancellation (with linked refund) from buyer-cancel paths |

### Payment

#### `payment.succeeded`

| | |
| --- | --- |
| Category | `payment` |
| Producer | `routes/v1/webhooks/stripe.ts` `handlePaymentIntentSucceeded()` (paired with `order.created`) |
| Consumer | audit-only |
| Entity | `entityType="checkout_session"`, `entityId=session.id` |
| Actor | `actorId=session.buyerId` |
| Channel | yes |
| Metadata | `{ paymentIntentId: string, orderId: ULID }` |
| Why | Payment-domain audit row separate from order-domain `order.created` (different entity, different category) |

#### `payment.failed`

| | |
| --- | --- |
| Category | `payment` |
| Producer | `routes/v1/webhooks/stripe.ts` `handlePaymentIntentFailed()` (paired with `inventory.released`) |
| Consumer | audit-only |
| Entity | `entityType="checkout_session"`, `entityId=session.id` |
| Actor | `actorId=session.buyerId` |
| Channel | yes |
| Metadata | `{ paymentIntentId: string }` |
| Why | Audit + analytics counterpart to `payment.succeeded` |

### Payout

#### `payout.released`

| | |
| --- | --- |
| Category | `payout` |
| Producer | [`routes/v1/admin/payouts/routes.ts`](../packages/api/src/routes/v1/admin/payouts/routes.ts) `POST /api/v1/admin/payouts/:holdId/release` |
| Consumer | audit-only |
| Entity | `entityType="payout_hold"`, `entityId=holdId` |
| Actor | admin `actorId` |
| Channel | yes |
| Metadata | `{ transferId: string \| null, amountCents: number }` |
| Why | Audit the moment a hold flips to a Stripe transfer. Useful for finance reconciliation |

## Handler registry (mirror of `event-consumer.ts`)

See [workers.md → event-consumer handler registry](workers.md#event-consumer-handler-registry) for the live registry. Reproduced briefly here for completeness:

| Event | Side effect | Fans out to `search-sync`? |
| ----- | ----------- | -------------------------- |
| 7 listing/profile/score events (the `SEARCH_SYNC_EVENTS` set in `event-consumer.ts`) | (none beyond fan-out, except the two below) | yes |
| `channel_listing.created` | also `enqueueListingScore` | yes |
| `channel_listing.content_changed` | also `enqueueListingScore` | yes |
| `order.shipped` | `enqueueEmail(shipping_confirmation_buyer)` | no |
| `order.tracking_exception` | `enqueueEmail(tracking_exception_admin)` | no |
| `order.delivered` | log only (placeholder) | no |
| All others | audit-only — `marketplace_events.delivery_status="delivered"` | no |

## Defined but never emitted

The shared schema enumerates `auth`, `user`, `shipping`, `dispute`, `admin`, `system` categories, but no current code emits an event in any of those categories. Most likely candidates for future events:

- `shipping.*` — currently the same information rides on `order.tracking_*` events using category `order`. A separate `shipping` namespace may emerge if shipping events ever need a different consumer set.
- `dispute.*` — Stripe disputes are handled inline in webhook code without dispatching a marketplace event.
- `admin.*` — admin actions currently reuse domain categories (`order.cancelled`, `payout.released`).

## Inconsistencies (real, in current code)

- **No typed event-name enum.** Emitters pass arbitrary strings; consumers `switch` on them. A typo is a silent miss until QA.
- **`category` is loosely typed.** `dispatchEvent()` accepts `category: string`; the shared `eventCategorySchema` rejects values like `listings`, `profiles`, `payout` that the runtime emits.
- **Delivery status drift.** `deliveryStatusSchema` allows `pending`, `dispatched`, `failed`. The consumer writes `delivered` (which the schema does not list). No code path currently writes `failed` to `delivery_status`.
- **`order.delivered` has a consumer but no producer.** Existing flows update the order directly. Either wire it up or drop the handler.
- **`channel_listing.status_changed` has two categories.** Seller-initiated transitions emit `category="listings"`; cascade paths in `inventory-invariants.ts` emit `category="listing"`. Trivial to fix in a follow-up.

## Pending W3 merge

> **Sprint 1b W3 (multi-vendor checkout) — not yet merged at the time of this rewrite (2026-05-03).**
> W3 will introduce events around `order_groups` and per-seller `order_group_seller_allocations`. Expected new event names (subject to W3's final design — confirm against the W3 PR before referencing in code):
> - `order_group.created`, `order_group.expired`
> - `allocation.created`, `allocation.fulfilled`, `allocation.refunded`
>
> Update this catalogue and the handler registry in `event-consumer.ts` as part of the W3 merge. Coordination: [PARALLEL-PLAN.md Zone D](handoffs/PARALLEL-PLAN.md#zone-d--workers).
