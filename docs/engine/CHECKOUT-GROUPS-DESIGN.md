> **Provenance:** fork-local design doc (NOT copied from piklo-v2). Written 08/07/2026 against bushpop-v2 `main` @ `b07d8a3`. Supersedes the multi-vendor sections of `CHECKOUT-FLOW.md` / `PAYMENT-FLOW.md` where they conflict (those docs describe piklo's pre-fork W3 plan; this doc is the bushpop Phase-2 plan).

---
last-verified: 2026-07-08
---

# Checkout Groups — Multi-Vendor Checkout Design (Phase 2)

> The complete design for finishing `/checkout-groups`: payment topology, webhook leg, expiry leg, reconciliation, and fee application — plus the migration path from single-seller launch and the work packages to build it. This doc is the source for future `/autopilot` dispatches (§7).

**Status:** design locked pending Ben's review of three flagged decisions (§8). The endpoint stays gated OFF (`MULTI_VENDOR_CHECKOUT_ENABLED`, `packages/api/src/server.ts:203-214`) until WP-2..WP-5 land.

**Fee model context (Fee Model D, locked 04/07/2026):** buyer-side Buyer Protection **4% + 50¢** on posted-items subtotal (`calcBuyerProtectionFeeCents`, `packages/config/src/fees.ts`), $0 on pickup; seller-side commission **1.75% + 30¢** (`calcFeeCents`). Commission-only multi-vendor is contribution-negative (~−$0.15/order); BP makes it ~+$2.31/order. **BP on the group path is therefore mandatory from multi-vendor day one** — it is the whole reason this endpoint is gated.

---

## 1. Current-state map — what exists vs what's missing

All line numbers verified 08/07/2026 against `main` @ `b07d8a3`.

### Built and working (the front half)

| Piece | Where | Notes |
|---|---|---|
| Routes: POST create / GET poll / POST cancel | `packages/api/src/routes/v1/store/checkout-groups/routes.ts` | auth + idempotency middleware, 5/min rate limit |
| Quote + per-seller split | `checkout-groups/service.ts:148-596` (`createQuoteAndPaymentIntent`) | groups cart items by `inventory_items.ownerId`; re-validates listing state + price vs cart snapshot |
| Inventory reservation | shared `lib/inventory-reservation.ts` (`reserveItems`/`releaseItems`) | CAS `available → reserved`, inside the creation transaction |
| DB tables | `packages/db/src/schema/commerce.ts:262-390` + `allocation_refunds` | `order_groups`, `order_group_seller_allocations`, `order_group_allocation_items`; migrations 0018/0019 |
| One PaymentIntent per group | `service.ts:441-485` | `idempotencyKey: orderGroupId`; metadata `{orderGroupId, buyerId, chargeType, channelId, allocationIds}` |
| WAL payment-op before Stripe | `service.ts:432-438` | `createPaymentOp(orderId=null, "charge", …, orderGroupId)` — LB-F8 pattern |
| Quote-conservation anchor | `computeQuoteHash` (`service.ts:71-81`) | SHA-256 over sorted allocations — LB-M1 |
| State machines (scaffolded) | `lib/commerce-machines.ts:143-247` | `ORDER_GROUP_MACHINE`, `SELLER_ALLOCATION_MACHINE`, CAS via `version` |
| Cancel path | `service.ts` (`cancelCheckoutGroup`) | CAS → cancelled, releases inventory via allocation items (not cart) |
| Unit tests (front half) | `checkout-groups/service.test.ts` (512 lines) | WAL, conservation, CAS, SC&T vs destination, 5xx-indeterminate, cancel |
| Env gate + gate test | `server.ts:203-214`; `test/integration/store/checkout-groups-gate.test.ts` | 404 + hidden from Swagger unless flag is exactly `"true"` |

### Missing or wrong (the reason the gate exists)

| Gap | Evidence | Consequence if un-gated today |
|---|---|---|
| **$0 Buyer Protection fee** | `computeSellerTotals` (`service.ts:104-124`) calls shared `calculateOrderTotals` then recomputes `totalCents = subtotal + shipping`, dropping `buyerProtectionFeeCents` (line 121); `groupTotal = groupSubtotal + groupShipping` (line 344) | Every group order is contribution-negative; a crafted request bypasses the fee entirely (Codex: HIGH; Opus: revenue gap) |
| **No webhook leg** | `webhooks/stripe.ts:233-238` — `handlePaymentIntentSucceeded` looks up `checkout_sessions` by PI id only; a group PI logs "No checkout session found" and returns | Buyer's card is charged; **no order, no payout hold, no email, nothing** — money captured with zero downstream record |
| **No `payment_failed` / `requires_action` group branches** | `stripe.ts:582-685` are session-only | Declined group payments leave the group `payment_pending`, inventory reserved |
| **No expiry leg** | `workers/checkout-expiry.ts:127-136` sweeps `checkout_sessions` only; `createQuoteAndPaymentIntent` never calls `scheduleCheckoutExpiry`; nothing consumes `order_groups.expires_at` (30 min, `service.ts:45`) | Abandoned groups hold inventory **reserved forever** — only manual buyer cancel releases |
| **Reconciliation explicitly skips groups** | `workers/reconcile-indeterminate-ops.ts:76-81`: `if (!op.orderId) { result.stillStuck += 1; continue; }` | A group PI in `indeterminate_5xx` is stuck forever; no reconciler resolves it |
| **No BP column anywhere in the group schema** | `order_groups` and `order_group_seller_allocations` have subtotal/shipping/platformFee/proceeds/total only | Even a computed BP fee has nowhere to persist |
| **Destination-charge branch bypasses escrow** | `service.ts:268` picks `"destination"` for 1-seller groups → `transfer_data.destination` + `application_fee_amount` (`service.ts:461-468`) — funds move to the seller **at capture** | Contradicts NEW-002 (`STRIPE-MONEY-FLOW.md`): the live checkout deliberately uses plain PI + `payout_holds` escrow precisely because destination charges are incompatible with the inspection window |
| **Refunds are uncapped against the PI** | `lib/refund-service.ts:291,399,593` — all three `stripe.refunds.create` calls omit `amount` → full-remaining-charge refund | Benign today (1 PI = 1 order). Under a shared group PI: refunding seller A's order **refunds the whole group** while B/C's payout holds still release real transfers → direct platform loss up to the group total. **This is the sharpest finding in this design pass — see WP-0.** |
| **No dispute handler at all** | no `charge.dispute.created` anywhere in `stripe.ts` | A chargeback on the shared PI is for the **full group amount** and must freeze payout holds for ALL orders in the group — including innocent sellers |
| **No per-seller settlement** | `stripe_transfer_id` / idempotency cols on allocations exist but nothing writes them; `allocation-fanout` worker never built | Multi-seller money can't reach sellers (moot until the webhook leg exists — and §2 removes the need for this worker entirely) |

### Interim safety fix (ships now, separate PR)

Until WP-2 wires the fee, `createQuoteAndPaymentIntent` refuses any quote where shared fee math says BP is owed: guard `expected === charged` → `422 FEE_MODEL_INCOMPLETE` (charged is 0 today, so any posted cart is refused; pickup-only carts legitimately owe $0 and pass). Defence-in-depth behind the env gate, and the guard survives WP-2 as a permanent conservation invariant once `charged` becomes real. See PR `fix/checkout-groups-fee-gate`.

---

## 2. Payment topology — one PaymentIntent per group, SC&T everywhere

### Decision

**Keep exactly one PaymentIntent per group** (what the code already does), **retire the destination-charge branch**, and settle by creating **one `orders` row per seller allocation** on `payment_intent.succeeded`, reusing the existing per-order machinery wholesale: `order_items`, `payout_holds`, `enqueueOrderJobs`, the payout-release sweep, and `processRefund`. **No `allocation-fanout` transfer worker is built** — the piklo W3 plan for it predates the payout-holds escrow; per-order `releasePayoutHold()` already does idempotent, advisory-locked, list-first-reconciled Stripe transfers, one per order, and the sweep worker already schedules them.

### Why not per-seller PaymentIntents

| Dimension | One group PI (chosen) | Per-seller PIs (rejected) |
|---|---|---|
| Buyer confirmation | One card confirmation | N confirmations, or saved-payment-method off-session confirms — 3DS challenges (increasingly common on AU cards even without an SCA mandate) can fire mid-sequence with no UI to answer them |
| Partial failure at capture | Impossible — capture is atomic | First-class failure mode: PI 1 succeeds, PI 2 declines → buyer partially charged, cross-PI compensation logic required |
| Stripe fee incidence | ~1.75% + 30¢ **once** per checkout (platform is MoR, absorbs processing) | 30¢ fixed component **× N sellers** — at bushpop's AOV this erases most of the BP margin |
| Refund granularity | Per-order **partial refunds** against the shared PI (amount-capped — WP-0) | Native per-PI refunds (the one real advantage) |
| Reconciliation | 1 PI ↔ 1 group ↔ N orders; conservation invariant is a single sum | N PIs per checkout to track, dedup, and expire |
| Existing code | Already built | Rewrite of the whole front half |

Refund granularity is the only dimension where per-seller PIs win, and amount-capped partial refunds (WP-0) close that gap at near-zero cost. Decision confidence: **high**.

### Why retire the destination branch (single-seller groups)

The `chargeType === "destination"` branch (`service.ts:268`, `:461-468`) moves funds to the seller **at capture** via `transfer_data.destination`. That:

1. **Bypasses the payout-holds escrow** — the buyer-protection window (delivery+3d tracked / +14d untracked / immediate on buyer-confirm, `payout-hold-service.ts` `evaluateHoldPolicy`) is the product's core trust mechanic and the live checkout's settled design (NEW-002 chose SC&T over destination charges for exactly this reason).
2. Forks the refund path — destination-charge refunds need the `reverse_transfer` / `refund_application_fee` flag gymnastics documented at `checkout/service.ts:588-631`; SC&T refunds don't.
3. Was the proximate cause of the $0-BP bug: `application_fee_amount` derives from `totalCents − sellerProceedsCents`, so including BP in `totalCents` over-withheld from the seller — the author dropped BP entirely rather than solve it. On the SC&T rail this failure mode **does not exist**: the transfer amount is `sellerProceedsCents`, computed independently of BP.

Retirement mechanics: always write `chargeType = 'sct'`. Keep the column and DB check (`order_groups_charge_type_enum`, `commerce.ts:310`) — no migration needed; the `'destination'` value simply stops being written. Rewrite `service.test.ts` tests 4/4b (currently assert `transfer_data.destination` and app-fee withholding) to assert SC&T for single-seller groups. The destination-only state-machine edges (`payment_pending → allocated`, `charge_reserved → transferred` skip-paths) are harmless vestiges; leave them.

### Settlement shape

```
payment_intent.succeeded (one event, one group)
  └─ webhook: CAS group → confirming
       └─ for each allocation (idempotent, linearised):
            INSERT orders (status 'paid', allocation_id UNIQUE)  ← onConflictDoNothing
            INSERT order_items   (from order_group_allocation_items)
            INSERT payout_holds  (status held/blocked, per order)
            enqueueOrderJobs(orderId)   ← deterministic jobIds, existing worker fleet
       └─ all N orders exist → CAS group → allocated; delete cart items (group-level, once)
  └─ later: payout-release sweep transfers each order's sellerProceeds on hold release
            (transfer_group = orderId — NOT orderGroupId; see §6 invariants)
```

Group orders are built from **`order_group_allocation_items`** (quote-time snapshot, cascade-protected composite FK), never from `cart_items` — the session path's AUDIT-003 crash-recovery weakness (order built from cart rows that may be gone, `stripe.ts:350-377`) is structurally absent here.

**State ladder collapses to `created → payment_pending → [requires_action] → confirming → allocated`.** `confirming → allocated` is already a legal edge (`commerce-machines.ts:162,183-189`). `paid_unallocated`, `allocating`, and `partially_failed` existed only for the deleted fan-out worker: they stay in the machine but are **never entered**. A group stuck in `confirming` beyond 15 min is an alert condition (§5), and Stripe's webhook retries drive idempotent completion — there is no partial-failure *state*, only partial *progress* that the next retry finishes. Useful property: `confirming` is in `ORDER_GROUP_ACTIVE_STATUSES` (`commerce-machines.ts:200-205`), so the cart's active-group partial unique index stays held until the orders actually exist.

### Constraints carried forward

- **Seller cap per group: 10.** Two independent reasons: the PI metadata `allocationIds` comma-join hits Stripe's 500-char metadata value cap at ~18 sellers, and refund/dispute blast radius on a shared PI grows linearly with N. Enforce at quote time (422). Pairs with ADR-018's ~$1k cart cap (final value = Ben, see §8).
- **`piklo_*` Stripe metadata keys are load-bearing** (FORK.md): the refund/reversal/transfer reconcilers key off `piklo_payment_op_id` etc. Group code inherits them for free by reusing `processRefund`/`releasePayoutHold`. New group-specific keys (`orderGroupId`, …) are *additions* — allowed. Never rename.
- **ADR-018 (piklo-era) tension flagged, not resolved:** its 60-min zero-balance fan-out-or-refund rule conflicts with payout holds that last days. This design follows the **live** escrow model (identical money posture to single-seller today); the regulatory question (AFSL #517024, incidental-transfer characterisation) needs the lawyer review the roadmap already requires before multi-vendor go-live. See §8.

---

## 3. Fee application — Buyer Protection per seller allocation

### Decision

**BP attaches per seller allocation** (4% + 50¢ per seller sub-order), computed by the shared `calculateOrderTotals` per seller group **as-is** — the `computeSellerTotals` strip-out is deleted, not patched. Commission (1.75% + 30¢) already attaches per seller allocation and is unchanged.

Each allocation is a *real order*: its own shipping, its own delivery, its own payout hold, its own refund lifecycle. Fee Model D's unit is "per order", and in a multi-seller cart the buyer is genuinely placing N orders through one payment.

### Money math (per allocation, all integer cents, shared functions only)

```
subtotal_a        = Σ item.priceCents                          (posted + pickup items of seller a)
shipping_a        = calculateShipping(items_a)                  (existing shared logic)
bp_a              = calcBuyerProtectionFeeCents(postedSubtotal_a)   ← 4% + 50¢, $0 if postedSubtotal_a = 0
commission_a      = calcFeeCents(subtotal_a)                        ← 1.75% + 30¢
total_a           = subtotal_a + shipping_a + bp_a
sellerProceeds_a  = subtotal_a + shipping_a − commission_a − prepaidLabel_a    (BP NEVER touches proceeds)
```

Group rollups (pure sums, no independent rounding — **cents cannot go missing by construction**):

```
group.subtotal_cents             = Σ subtotal_a
group.buyer_protection_fee_cents = Σ bp_a           ← new column (WP-1)
group.total_cents                = Σ total_a        ← the Stripe PI amount
```

Rounding happens exactly once per allocation inside `calcBuyerProtectionFeeCents` / `calcFeeCents` (`Math.round(cents × bps / 10_000) + fixed`), then everything upward is addition. The conservation invariant is exact equality, checked at three points: quote time (assert), webhook time (PI `amount_received` vs stored `group.total_cents` — hard-fail mismatch), and the audit sweep (§5).

**Refund treatment:** a refunded allocation-order refunds `order.totalCents` — which *includes its own BP* — as an amount-capped partial refund against the shared PI. No pro-rata BP arithmetic exists anywhere. (Whether BP is refunded on seller-fault refunds is policy; the mechanics support either — the refund amount is just the order's own snapshot.)

### The rejected alternative: per-group BP (4% + 50¢ once)

Charge `calcBuyerProtectionFeeCents(Σ postedSubtotals)` once at group level. Buyer saves 50¢ × (N−1) plus a rounding cent or two. Costs:

1. **Partial-refund allocation problem:** when 1 of 3 allocations refunds, how much of the group BP goes back? Requires a pro-rata split with **largest-remainder rounding** (assign `floor(bp × subtotal_a / Σsubtotal)` then distribute leftover cents to largest remainders) persisted per allocation at quote time — real complexity whose only job is preserving cents.
2. **Breaks the "allocation = order" symmetry:** allocation orders would carry a BP share ≠ what `calculateOrderTotals` would say for that order, so every invariant check needs a special case, and `orders.buyer_protection_fee_cents` no longer means the same thing on both paths.
3. **Flat-fee economics:** the 50¢ exists to cover per-order fixed costs (support, disputes, delivery risk), which scale with N sellers, not with checkouts.

Per-allocation wins on engineering decisively. The buyer-facing optics (50¢ × N, itemised) are a product call — **flagged for Ben** (§8), and the quote response itemises BP per seller so the UI can disclose it cleanly (ACCC drip-pricing: the fee must appear in the quote the buyer confirms, never added after).

### Schema/type changes (WP-1/WP-2)

- `order_group_seller_allocations.buyer_protection_fee_cents` int NOT NULL default 0 — set at quote time (quote-lock principle: never recompute fees at webhook time).
- `order_groups.buyer_protection_fee_cents` int NOT NULL default 0 — the rollup, for reconciliation and reporting parity with `orders`/`checkout_sessions` (migration 0024 precedent).
- `AllocationSummary` / `CheckoutGroupTotals` types (`packages/types/src/commerce.ts`) gain `buyerProtectionFeeCents` so the quote response can disclose per-seller fees.
- The interim guard (§1) flips from "refuse when BP owed" to the permanent invariant `chargedBp === Σ calcBuyerProtectionFeeCents(postedSubtotal_a)` — same code shape, `charged` becomes real.

---

## 4. Webhook and expiry legs

### 4.1 Webhook leg

**Dispatch:** in `handlePaymentIntentSucceeded` (and `…Failed`, `…RequiresAction`), when the `checkout_sessions` lookup by `stripe_payment_intent_id` misses, look up `order_groups` by the same column before logging "not found". (Metadata `orderGroupId` is a cross-check, not the primary key — DB lookup by PI id is the pattern the session path already uses.) Event-level dedup is inherited: `processed_webhook_events (provider, event_id)` short-circuits duplicates before any handler runs.

**`payment_intent.succeeded` → `completeOrderGroup(groupId, pi)`:**

1. **Verify** `pi.amount_received === group.total_cents` — mismatch: alert + dead-letter, do NOT proceed (conservation gate). Re-derive `quoteHash` from stored allocations and compare — drift: same treatment (LB-M1).
2. **CAS** group `payment_pending | requires_action → confirming` (also accept `expired` — see late-success below). CAS failure with group already `confirming`/`allocated` → fall through to step 3 anyway (idempotent re-entry after a mid-loop crash); any other state → log + return 200.
3. **Per allocation, in a transaction each** (small transactions, idempotent loop):
   - `INSERT INTO orders (…, allocation_id, status 'paid', money snapshot from the allocation row, stripePaymentIntentId) ON CONFLICT (allocation_id) DO NOTHING` — **the linearisation point**, mirroring the session path's `onConflictDoNothing({target: checkoutSessionId})` (`stripe.ts:449-482`). Only the insert winner does that allocation's side effects.
   - Winner side effects: mark that allocation's inventory `sold` + `cascadeLifecycleToListings`; insert `order_items` from `order_group_allocation_items`; insert `payout_holds` (`held` if seller charges-enabled else `blocked` — same logic as `stripe.ts:516-533`); set `allocations.order_id` + allocation status; `enqueueOrderJobs(orderId)`.
4. **Completion check:** all N allocations have orders → CAS `confirming → allocated`, delete the group's cart items (once, group-level), dispatch `order.created` × N + `payment.succeeded` events.
5. Any step throwing → non-2xx → **Stripe retries the whole handler**; steps 2-4 are all CAS/upsert-idempotent, so retries finish partial progress. This is why no `partially_failed` state is needed.

**`payment_intent.payment_failed`:** CAS `payment_pending | requires_action → payment_declined`, `releaseItems` (via allocation items), dispatch `payment.failed` + `inventory.released`. Mirrors `stripe.ts:618-685`.

**`payment_intent.requires_action`:** CAS `payment_pending → requires_action` (3DS). Mirrors `stripe.ts:582`.

**Out-of-order rules:** `succeeded` arriving before a `requires_action` that's still in flight — the `requires_action` CAS simply fails against `confirming` and is dropped (correct). `payment_failed` after `succeeded` — CAS fails, dropped. The dedup table handles same-event redelivery; CAS-from-specific-states handles cross-event ordering. No `FOR UPDATE` needed at group level because every transition is single-row CAS; the refund reconcilers' existing `FOR UPDATE` on `orders` (LB-R2-2) continues to serialise the per-order refund legs.

**Late success after expiry (compensation):** if `succeeded` arrives for a group already `expired` (expiry worker won the race), mirror `handlePaymentAfterExpiry` (`checkout/service.ts:557`): attempt to re-reserve all items; all still available → proceed through `completeOrderGroup` (accepting `expired → confirming`, a new machine edge, WP-3); any item gone → **auto-refund the full PI** with `piklo_reason: "late_success_recovery"` metadata via the existing refund-op machinery. All-or-nothing — never partially fulfil a group the buyer paid for in full.

### 4.2 Expiry leg — `order-group-expiry` worker

New worker `packages/api/src/workers/order-group-expiry.ts`, a structural clone of `checkout-expiry.ts` (the doc'd piklo W3 plan, now targeting the collapsed state ladder):

- **Queue** `order-group-expiry`; per-group **delayed job** `jobId: expire-group-${groupId}`, `delay = expiresAt − now`, `removeOnComplete: true, removeOnFail: 3`, scheduled by `createQuoteAndPaymentIntent` right where the session path calls `scheduleCheckoutExpiry` (`checkout/service.ts:373`). Cancel/complete paths may leave the job in place — expiry is CAS-guarded and no-ops on terminal states.
- **`expireOrderGroup(groupId)`**: CAS `created | payment_pending | requires_action → expired`; on success `releaseItems` (from allocation items) and **cancel the Stripe PI** (`stripe.paymentIntents.cancel`, ignore already-canceled/succeeded errors — a `succeeded` race is handled by the late-success path above). Idempotent: CAS failure = someone else moved the group; log + done.
- **Safety-net sweep** (crashed workers, Redis loss): `setInterval` every 5 min (`.unref()`), batch-50 query for groups in `ORDER_GROUP_ACTIVE_STATUSES` minus `confirming` with `expires_at < now`, run `expireOrderGroup` on each — mirroring `reconcileExpiredSessions` (`checkout-expiry.ts:99-154`). **`confirming` is excluded**: payment already captured; a stuck `confirming` group is a reconciliation/alert case (§5), never an expiry case.
- Registered in `workers/index.ts` unconditionally (like `checkout-expiry`) — it no-ops when no groups exist, so it doesn't need the env gate.

---

## 5. Reconciliation

### Invariants (the always-true list)

| # | Invariant | Enforced at |
|---|---|---|
| I1 | `group.total_cents = Σ allocation.total_cents` and each `allocation.total = subtotal + shipping + bp` | quote-time assert; audit sweep |
| I2 | `pi.amount_received = group.total_cents` for any group ≥ `confirming` | webhook step 1 (hard gate); audit sweep |
| I3 | `quoteHash` re-derives identically from stored allocations | webhook step 1; audit sweep |
| I4 | group `allocated` ⇔ exactly N orders with `allocation_id` linking to its allocations, each order's money snapshot = its allocation's | audit sweep |
| I5 | Σ Stripe refunds on a group PI ≤ `group.total_cents`, and each refund maps to one order's refund row | WP-0 amount cap; audit sweep |
| I6 | Every order's payout transfer has `transfer_group = orderId` (never `orderGroupId`) | code convention — the payout-release orphan-transfer reconciler *lists by* `transfer_group = orderId` (`payout-release.ts:232`); the PI-level `transfer_group = orderGroupId` label is unrelated and must not be "unified" |
| I7 | No group in `confirming` older than 15 min | stuck-group monitor |

### Machinery

1. **Extend `reconcile-indeterminate-ops`** (WP-5) — delete the `if (!op.orderId) skip` branch (`reconcile-indeterminate-ops.ts:76-81`); for ops with `orderGroupId` set, resolve the PI via `stripe.paymentIntents.search("metadata['orderGroupId']:'…'")` (Stripe has no list-by-metadata; **search has ~1 min index lag** — irrelevant under the worker's existing 1 h grace). PI found + succeeded → `succeedIndeterminateOp` + run `completeOrderGroup` (same idempotent path as the webhook). Not found after grace → fail the op, CAS group → `expired`, release inventory. **Never replay `paymentIntents.create` on the same idempotency key after a 5xx** — Stripe caches the error for 24 h (existing rule, `service.ts` comments).
2. **Group-conservation audit sweep** (WP-5) — repeatable job (hourly, `Australia/Sydney`, same `upsertJobScheduler` pattern as `payout-release.ts:311-319`), **alert-only, never writes**: checks I1-I5 over recent groups + I7. Emits `admin_alert` events (existing alerting path used by refund-service).
3. **Auto-heal vs alert:**

| Condition | Response |
|---|---|
| Missed/late webhook (PI succeeded, group still `payment_pending`) | **Auto-heal** — indeterminate-ops reconciler + Stripe webhook retries both converge on `completeOrderGroup` |
| Group `confirming` with k < N orders | **Auto-heal** — next webhook retry / reconciler pass finishes the loop; alert only if it persists past I7's window |
| I1/I3 conservation or quote-hash mismatch | **Alert, freeze** — never auto-correct money rows; a human decides (this is a bug or tampering, not drift) |
| I2 amount mismatch at webhook | **Alert + dead-letter, refuse to fulfil** |
| I5 refund-sum violation | **Alert + freeze all group payout holds** (`freezePayoutHold` per order) |
| Indeterminate op unresolved > 24 h | **Alert** (existing operator-escalation convention) |

### Disputes (design placeholder — WP-6)

There is currently **no `charge.dispute.created` handler at all** (single-seller gap too, but group-critical): a chargeback on a group PI is for the **full group amount**. Minimum viable handling, required before un-gate: on `charge.dispute.created`, resolve PI → group → orders and `freezePayoutHold` on **every** order in the group (already-released holds: flag for manual clawback assessment); alert admin with the per-order breakdown; unfreeze non-disputed sellers' holds manually after triage. Full dispute-lifecycle automation is post-launch scope.

---

## 6. Migration path — single-seller live → multi-vendor on

Every step is independently shippable and testable **with the gate still OFF**; nothing before step 8 changes live behaviour.

| Step | Ships | Why it's safe |
|---|---|---|
| 0 | **WP-0**: `amount: order.totalCents` on all three `stripe.refunds.create` calls | Exact no-op for current traffic (1 PI = 1 order ⇒ amount = full charge); closes the group-refund money hole before anything else lands |
| 1 | **WP-1**: schema migration — `orders.checkout_session_id` nullable, `orders.allocation_id` UNIQUE, XOR check, BP columns on allocations + groups, unique index feeding the linearisation | Additive; existing rows satisfy XOR (all have sessions); no code reads the new columns yet |
| 2 | **WP-2**: fee integration — delete the BP strip-out, per-allocation BP, guard flips to invariant, types/response disclosure | Endpoint is 404 (gated); unit tests prove the math |
| 3 | **WP-3**: webhook branches (succeeded/failed/requires_action + late-success) | Dark: no group PIs exist in prod, handlers are unreachable; integration tests drive them with synthetic events |
| 4 | **WP-4**: order-group-expiry worker | Dark: sweeps an empty set |
| 5 | **WP-5**: reconciliation (indeterminate-ops group path + audit sweep) | Dark: no group ops exist |
| 6 | **WP-6**: refund/dispute group-awareness | LB-R2-1 scope change is behaviour-preserving for 1-PI-1-order; dispute freeze is net-new |
| 7 | **WP-7**: destination retirement + seller cap + state-collapse test updates | Gated code only |
| 8 | **Staging un-gate**: `MULTI_VENDOR_CHECKOUT_ENABLED=true` on staging only; run the full E2E (WP-8); soak with real test-mode Stripe | Prod still 404s. Note the Coolify env trap: compose defaults override Coolify-only env on every deploy — the flag flip must be a compose-default change per `.claude/CLAUDE.md` §Deploy |
| 9 | **Frontend group flow** (WP-8): cart → group quote → Payment Element → poll `GET /checkout-groups/:id` → per-order confirmation. Single-seller carts KEEP using `/checkout` | Buyer-visible only on staging until step 10 |
| 10 | **Prod un-gate** after Ben's §8 decisions + the lawyer review the roadmap requires. `/checkout` remains the single-seller path — `checkout_sessions` cutover/drain (piklo W5/W6) is deliberately **out of scope**; both paths coexist | Instant rollback = flip the flag; in-flight groups still complete (webhook routes are registered unconditionally) |

**What changes for the live single-seller path: almost nothing.** WP-0 is a no-op by construction; WP-1 relaxes a NOT NULL that all existing rows satisfy; WP-6's LB-R2-1 rescope is identity-equivalent when a PI has one order. That near-zero blast radius is the main payoff of the reuse-per-order-machinery topology.

---

## 7. Work packages

Sized for Sonnet/Codex sessions; each independently PR-able in order. Every WP touching money (WP-0, 2, 3, 6) gets cross-model review + Ben's merge gate per house rules.

**WP-0 — Refund amount cap** *(S; ships first)*
`refund-service.ts:291,399,593`: add `amount: order.totalCents` to all three `stripe.refunds.create` calls.
✅ All existing refund tests green unchanged; new unit test asserts the `amount` param is passed; a two-orders-one-PI fixture proves refunding order A leaves order B's balance refundable.

**WP-1 — Schema migration bundle** *(S-M)*
Migration (next free number ≥ 0028): `orders.checkout_session_id` DROP NOT NULL; `orders.allocation_id` text NULL UNIQUE REFERENCES `order_group_seller_allocations(id)`; CHECK exactly-one-of(`checkout_session_id`, `allocation_id`); `buyer_protection_fee_cents` int NOT NULL DEFAULT 0 on `order_group_seller_allocations` + `order_groups`. Drizzle schema + types updated.
✅ Migration applies on a copy of staging; existing suite green; XOR check proven by two failing-insert tests.

**WP-2 — Fee integration** *(M; money — cross-model review)*
Delete the `computeSellerTotals` BP strip-out (use `totals.totalCents` + surface `buyerProtectionFeeCents`); persist BP per allocation + group rollup; flip the interim guard to the permanent `charged === expected` invariant; `AllocationSummary`/`CheckoutGroupTotals` disclosure; update conservation tests.
✅ Multi-seller quote shows `bp_a = calcBuyerProtectionFeeCents(postedSubtotal_a)` per allocation; `group.total = Σ(subtotal_a + shipping_a + bp_a)`; pickup-only allocation has `bp = 0`; guard test (422 when charged ≠ expected) still passes via a deliberately-broken fixture.

**WP-3 — Webhook leg** *(L; money — cross-model review)*
`completeOrderGroup` per §4.1 (order-group fall-through lookup, amount + quote-hash gates, CAS → confirming, per-allocation linearised order inserts + payout holds + jobs, → allocated, cart cleanup); `payment_failed` + `requires_action` branches; late-success-after-expiry compensation incl. the `expired → confirming` machine edge.
✅ Integration tests: happy path creates N orders + N holds + N job sets exactly once under duplicate + interleaved event delivery; mid-loop crash then redelivery completes the remainder; declined → `payment_declined` + inventory released; amount-mismatch event fulfils nothing and dead-letters; late-success with an item gone auto-refunds in full.

**WP-4 — order-group-expiry worker** *(M)*
Per §4.2: delayed job + `expireOrderGroup` + 5-min safety-net sweep; schedule call in `createQuoteAndPaymentIntent`; register in `workers/index.ts`.
✅ Expired group → `expired`, inventory `available`, PI canceled; sweep catches a group whose delayed job was dropped; `confirming` groups never expired; race with `succeeded` resolves via the WP-3 late-success path (test both orderings).

**WP-5 — Reconciliation** *(M)*
Remove the `orderId=null` skip in `reconcile-indeterminate-ops.ts`; group resolution via `paymentIntents.search` + `completeOrderGroup`; hourly conservation audit sweep (I1-I5, I7) emitting `admin_alert`, alert-only.
✅ Synthetic indeterminate group op with a succeeded PI → group reaches `allocated`; with no PI → op failed + group expired + inventory released; seeded conservation violation raises an alert and writes nothing.

**WP-6 — Refund + dispute group-awareness** *(M; money — cross-model review)*
Document/rescope LB-R2-1's shared-PI coupling (an unresolved refund op on order A blocks B/C — keep, it's conservative; admins need the error message to say so); refund ops on group orders set `orderGroupId`; `charge.dispute.created` handler with group-wide `freezePayoutHold` + admin alert per §5.
✅ Dispute event freezes every hold in the group incl. innocent sellers'; refund of one allocation-order refunds exactly `order.totalCents` (WP-0 fixture upgraded to 3 sellers); the coupling behaviour has an explicit test + error message.

**WP-7 — Destination retirement + seller cap** *(S)*
Always `'sct'`; delete the destination PI branch; quote-time 422 above 10 sellers; rewrite tests 4/4b; keep column/check/machine edges as vestiges.
✅ Single-seller group produces a plain SC&T PI (no `transfer_data`, no `application_fee_amount`) and, post-WP-3, a payout hold; 11-seller cart → 422.

**WP-8 — Frontend flow + E2E + un-gate runbook** *(L)*
`apps/market` multi-seller cart → group checkout page (per-seller BP itemisation) → Payment Element → group poller (polls `GET /checkout-groups/:id`, not `checkoutSessionId`) → per-order confirmation; orders API/UI tolerate null `checkoutSessionId`; Playwright E2E against the real stack (2-seller cart, pay, both orders land, both holds created); staging un-gate runbook (incl. the Coolify compose-default env trap).
✅ E2E green in CI; single-seller carts still route to `/checkout` untouched; runbook executed once on staging end-to-end.

Dependencies: WP-0 ⊥ everything; WP-1 → WP-2 → WP-3 → {WP-4, WP-5, WP-6} → WP-7 → WP-8. (WP-4 technically only needs WP-1, but sequencing after WP-3 lets its race tests use the real late-success path.)

---

## 8. Decisions needing Ben (before prod un-gate, none block WP-0..WP-7)

1. **Per-allocation BP optics** — buyer pays 50¢ × N sellers (itemised per seller). Engineering strongly prefers it (§3); the alternative saves the buyer ≤ 50¢ × (N−1) at real complexity cost. Default if unchallenged: per-allocation.
2. **ADR-018 zero-balance rule vs payout-holds escrow** — this design holds multi-seller funds in escrow exactly like single-seller. If the lawyer review lands on "incidental-transfer exemption requires the 60-min zero-balance posture", the settlement design changes materially (immediate transfers, no holds) — that's a different product. Get the legal answer before WP-8.
3. **Cart cap** — ADR-018's ~$1k multi-seller cart cap: confirm value or drop; seller cap of 10 (§2) ships regardless.
