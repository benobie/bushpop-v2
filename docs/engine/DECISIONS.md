> **Provenance:** engine doc copied from `benobie/piklo-v2` @ `2419a38` at fork time (02/07/2026), with `@bushpop/*` renamed `@bushpop/*`. May drift from upstream — see `docs/engine/FORK.md`.

# Architecture Decision Record

Decisions are numbered and immutable. To reverse a decision, add a new one that supersedes it.

## ADR-001: Custom Fastify+Drizzle over Medusa v2 (04/04/2026)

**Decision:** Build on Fastify v5 + Drizzle + Zod instead of Medusa v2 + Mercur.

**Why:** Medusa's DI container, abstract base classes, and opinionated module system added friction without value for a P2P marketplace. Multi-channel support required deep customisation that fought Medusa's architecture. 4 rounds of adversarial review confirmed custom stack is the right call.

## ADR-002: Better Auth for authentication (04/04/2026)

**Decision:** Use Better Auth v1.5.6 with Fastify adapter. Fallback: custom JWT.

**Why:** Better Auth provides email/password, email verification, session management, and RBAC out of the box. Lucia (the main alternative) is deprecated. CVE-2025-61928 was resolved in v1.4+. Spike-first approach de-risks the Fastify adapter integration.

## ADR-003: ULIDs for all primary keys (04/04/2026)

**Decision:** Use ULIDs (`varchar(26)`) instead of UUIDs or auto-increment integers.

**Why:** ULIDs are sortable by creation time (no separate created_at index needed for pagination), URL-safe, and 26 characters vs 36 for UUIDs. Drizzle supports them via `$defaultFn(() => ulid())`.

## ADR-004: Channel architecture over brand/tenant (04/04/2026)

**Decision:** Use "channel" terminology and `channels` table with `channel_id` FK.

**Why:** "Brand" is ambiguous (Zimmermann is a brand; Piklo is a channel). Channels represent distribution surfaces (Piklo, Bushpop) with their own domains, fees, and themes. Global entities (users, inventory) exist across channels; commerce is channel-scoped.

## ADR-005: Drizzle 0.45.x, avoid v1.0 beta (04/04/2026)

**Decision:** Pin Drizzle ORM to 0.45.x stable releases.

**Why:** Drizzle v1.0 beta introduces breaking changes to migration architecture. Production systems should stay on stable until v1.0 GA.

## ADR-006: BullMQ Job Schedulers API (04/04/2026)

**Decision:** Use BullMQ Job Schedulers for recurring jobs instead of repeatable jobs.

**Why:** Repeatable jobs API is deprecated from BullMQ v5.16.0. Job Schedulers is the replacement.

## ADR-007: Better Auth owns auth tables (04/04/2026)

**Decision:** Let Better Auth manage its own tables (user, session, verification, account) via Drizzle adapter. Application domain tables (user_roles, addresses, seller_profiles) are separate with FK to user.id.

**Why:** Fighting Better Auth's table structure adds complexity without benefit. Using its Drizzle adapter lets us define the exact column types (ULID IDs, timestamps with timezone) while keeping Better Auth's session resolution logic (join-based, 2-3x faster).

## ADR-008: Drizzle schema grouped by domain (04/04/2026)

**Decision:** Group schema files by bounded context: auth.ts, channels.ts, user-domain.ts, events.ts, infrastructure.ts.

**Why:** One-file-per-table is too fragmented; one giant file is unnavigable. Domain grouping keeps files under 150 lines and co-locates tables that reference each other. Scales to Phase 1+ by adding inventory.ts, commerce.ts, trust.ts.

## ADR-009: Simplified event dispatch (04/04/2026)

**Decision:** Write to marketplace_events + directly enqueue to BullMQ. No outbox polling.

**Why:** True outbox pattern (LISTEN/NOTIFY polling) adds complexity that isn't justified at early volume. If BullMQ enqueue fails, the event is logged; daily re-index catches gaps. Upgrade to outbox when volume justifies it.

## ADR-010: Stripe Connect Express with destination charges (04/04/2026) — SUPERSEDED by ADR-011

**Decision (superseded):** Use Stripe Connect Express accounts with destination charges.

**Why (historical):** Express accounts handle KYC/onboarding. Destination charges let the platform collect the full amount and distribute to sellers. Note: Express is "legacy" — architect for Accounts v2 migration path.

**Superseded 08/04/2026** — destination charges were replaced by separate charges and transfers in ADR-011. Express accounts remain the chosen onboarding surface.

## ADR-011: Separate charges and transfers over destination charges (08/04/2026)

**Decision:** Use Stripe's **separate charges and transfers** model (platform charges the buyer into platform balance; platform later issues `transfers.create` to seller Connect accounts on its own schedule). Supersedes ADR-010's "destination charges" choice. Connect Express onboarding is unchanged.

**Why:**
- **Chargeback liability sits on the platform** (where we can control it with Radar rules and seller holdbacks), not the seller account.
- **Payout timing is ours to control** via the `payout_holds` state machine, not Stripe's internal ordering — critical for our delivery-confirmation release gate.
- **Pre-transfer refunds are trivial** — refund the PaymentIntent; no reversal needed. Destination charges force `reverse_transfer=true` gymnastics.
- **Platform fee accounting is explicit** via `orders.platform_fee_cents`, not opaque `application_fee_amount`.
- **Multi-seller carts scale naturally** (N transfers per order) when that lands.
- **AU merchant-of-record positioning** is clearer when the platform holds funds.

**Trade-off:** Platform carries buyer funds on its Stripe balance between payment and payout. This has cashflow and regulatory implications that need legal review before scale. No reserve policy yet; no chargeback cover (Radar rules, seller holdback) yet. Tracked as open items in `docs/STRIPE-MONEY-FLOW.md`.

**Implementation landed:**
- Checkout creates PaymentIntent without `transfer_data`; `transfer_group` set to order id.
- Payout release worker calls `transfers.create({ destination: seller.stripe_account_id, amount: hold.amount_cents })` after CAS `held → releasing → released`.
- Refunds via `packages/api/src/lib/refund-service.ts` — pre-transfer path refunds the PaymentIntent directly; post-transfer path does `refunds.create` + `transfers.createReversal`. All Stripe calls go through the `payment_operations` WAL with ULID-based idempotency keys for crash recovery.

**Full model:** `docs/STRIPE-MONEY-FLOW.md`.

## ADR-012: Admin cancel folds into shared RefundService (08/04/2026)

**Decision:** Admin order cancellation is a thin route wrapper over `processRefund()` in `packages/api/src/lib/refund-service.ts`, not a separate service. `processRefund` takes `ProcessRefundOptions { isAdmin?, terminalOrderStatus? }`; admin cancel passes `{ isAdmin: true, terminalOrderStatus: "cancelled" }`.

**Why:** Admin cancel and seller refund share ~95% of the orchestration (pre-transfer vs post-transfer path, WAL crash recovery, Stripe idempotency, inventory restoration). They differ only in (a) who initiates (authz) and (b) the terminal order status for reporting. An option-bag refactor keeps both in one module and means future compensating-workflow callers (`payment_intent.canceled` webhook tracked as Phase 2B follow-up, dispute handling) get the same code path for free.

**Alternatives rejected:**
- *Separate `admin-cancel-service.ts` with new payout-hold interim states* (`cancelling`/`reversing`/`reversed`) as originally prescribed in the AUDIT-009 handoff. Rejected because `payment_operations` WAL + Stripe idempotency keys already provide the same crash-recovery guarantees with simpler state.
- *Refactor `processRefund` into `preTransferRefund`/`postTransferRefund` primitives with separate callers*. Rejected as scope creep; revisit if a third caller lands with meaningfully different semantics.

**Behaviour change:** Post-release admin cancel previously returned 409 with "manual reversal required" and operators fired Stripe calls out-of-band. It now runs `refunds.create` + `transfers.createReversal` through the WAL. Operators should stop using any manual reversal playbook for this case.

**Landed in:** PR #9 (`fix(api): admin cancel runs through processRefund (AUDIT-009)`).

**R1 clarification (08/04/2026 — see ADR-013):** GPT-Council Round 1 (FM-9) flagged that seller refund and admin cancel require *different* post-transfer ordering invariants. `processRefund`'s post-transfer path is **seller-initiated refund only** (refund-first, buyer always whole, platform absorbs reversal failure). Admin cancel post-release still returns 409 on released payout holds ([`admin/orders/routes.ts`](../packages/api/src/routes/v1/admin/orders/routes.ts) lines 56–60) as a temporary safety net until the R2 `adminCancelPostRelease` primitive lands with reversal-first + `seller_debts` semantics. The pre-release admin cancel path in ADR-012 is unchanged and correct.

## ADR-013: Stripe refund R1 resolution — FM-8 WAL ordering, FM-9 two-path contract, LB-3 indeterminate_5xx (08/04/2026)

**Decision:** GPT-Council Round 1 closeout for the Stripe refund pipeline. Three narrow, independent changes:

1. **FM-8 — WAL ordering fix.** In `processRefund` post-transfer path, pre-create the reversal `payment_operations` row *before* marking the refund op succeeded, so any crash between the Stripe refund return and the reversal call leaves a `pending` reversal op for `resumePendingRefunds` to recover. 5-line reorder in [`refund-service.ts`](../packages/api/src/lib/refund-service.ts).

2. **FM-9 — two-path contract for post-release refunds.** Seller-initiated refund and admin cancel require different ordering invariants and cannot share one implementation:
   - **Seller refund (implemented):** refund-first-then-reversal. Buyer always whole. Reversal failure → alert + (R2) `seller_debts` row. This is what `processRefund` ships today.
   - **Admin cancel (deferred to R2):** reversal-first-then-refund. Fail loudly if seller can't cover — return 502, do not refund the buyer, operator resolves manually. Currently 409s on released holds as the temporary safety net.
   Resolution in R1 is *doc-only* — [`STRIPE-MONEY-FLOW.md`](STRIPE-MONEY-FLOW.md) §3.5 split into two subsections with explicit path ownership. Code split deferred to R2 alongside the FM-6 `preTransferRefund` / `postTransferRefund` primitive refactor.

3. **LB-3 — Stripe 5xx indeterminacy.** Stripe caches 5xx responses under the original idempotency key for 24h and explicitly advises against retrying with a new key ([research-283](file:///Users/ben/obsidian-vault/piklo/research/strategy/04-execution/research-283-stripe-idempotency-5xx-behaviour.md)). The WAL-plus-idempotency-key recovery pattern alone is weaker than claimed. New model:
   - New `indeterminate_5xx` status on `payment_operations.status` distinct from `pending` (which `resumePendingRefunds` replays) and `failed` (terminal).
   - `IndeterminateStripeError` + `classifyAndMarkStripeError` classifier: `statusCode >= 500` transitions the op to `indeterminate_5xx` and short-circuits the caller — no downstream DB writes, no refund-row fail.
   - **Webhook reconciliation is the primary recovery path.** Three new handlers (`refund.created` / `refund.updated`, `charge.refunded`, `transfer.updated`) resolve the op by `metadata.piklo_payment_op_id` and call shared `reconcileRefundOpFromStripe` / `reconcileReversalOpFromStripe` helpers (CAS-guarded on `indeterminate_5xx`, idempotent against repeated deliveries).
   - **Metadata is load-bearing.** Every `stripe.refunds.create` and `stripe.transfers.createReversal` site must pass `{ piklo_payment_op_id, piklo_order_id, piklo_refund_id }` so webhooks can find the WAL row. This is now enforced at the call-site level, not optional.
   - **Daily reconciliation stub** in [`workers/reconcile-indeterminate-ops.ts`](../packages/api/src/workers/reconcile-indeterminate-ops.ts) for webhook-lost cases — walks stuck ops > 1h, queries Stripe via `refunds.list` / `transfers.retrieve`, matches by metadata, escalates at 24h. Cron wiring deferred to LB-2 / R2 ops console.

**Why:** R1 of the GPT-Council review on `docs/gpt-council/stripe-money-flow-and-admin-cancel.md` produced unanimous PROCEED WITH CHANGES from Gemini, Claude, and ChatGPT. These three items were the narrow scope that closes R1. The broader R2 agenda (FM-6 split, `seller_debts` table, `cancel_requested` state, full `adminCancelPostRelease`) is tracked separately in [`docs/handoffs/stripe-refund-r2-revised-design.handoff.md`](handoffs/stripe-refund-r2-revised-design.handoff.md).

**Stripe event type note:** The handoff originally prescribed a `transfer.reversal.created` webhook; the Stripe SDK does not expose such an event. Reversals are surfaced via `transfer.updated` with a grown `reversals.data` list. The implementation listens on `transfer.updated` and walks any reversals carrying our metadata. Recorded here so future handoffs don't repeat the assumption.

**Tests:** 12 new cases in [`refund-service.test.ts`](../packages/api/src/lib/refund-service.test.ts) cover FM-8 ordering (reversal op must exist at the moment `createReversal` is called), LB-3 5xx → `indeterminate_5xx` transition, `resumePendingRefunds` exclusion of indeterminate ops, both reconcile helpers, and webhook idempotency. Full API suite: 296 passed, 20 skipped, 31 todo.

**What this ADR does NOT cover:** FM-6 split, `seller_debts`, `cancel_requested`, full admin cancel post-release — all R2. AU payments-law memo (LB-1) and ops console (LB-2) — separate workstreams. Dispute-freeze webhook (FM-4) — Phase 2B follow-up.

**Source docs:** [`STRIPE-MONEY-FLOW.md`](STRIPE-MONEY-FLOW.md) §3.5 (two-path contract), [`gpt-council/stripe-money-flow-and-admin-cancel.md`](gpt-council/stripe-money-flow-and-admin-cancel.md) "Round 1 post-research additions" section, [`.review-state-stripe-money-flow-and-admin-cancel.md`](../.review-state-stripe-money-flow-and-admin-cancel.md) Confirmed Decisions table (FM-8 + FM-9 rows).

## ADR-014: Stripe refund R2 design locked — 38 decisions across 3 council rounds (08/04/2026)

**Decision:** Lock the R2 design for the Stripe refund + admin-cancel pipeline after 3 rounds of adversarial review (Gemini + Claude + ChatGPT). 38 confirmed decisions total: 11 inherited from R1 + 9 R2-R1 + 9 R2-R2 + 9 R2-R3. R2-R2 amended R2-R1 decisions #17 and #18; R2-R3 amended R2-R2 decision #25 via #36 (`payout_hold_freezes` table).

**Source of truth:** [`docs/gpt-council/stripe-refund-r2-revised-design.md`](gpt-council/stripe-refund-r2-revised-design.md). Do not duplicate the 38 decisions here — read the source. Convergence trajectory: R2-R1 18 findings → R2-R2 16 → R2-R3 10 (-38%); 0 structural findings in R3; all 3 models explicitly called R3 "convergence, not redesign". Re-litigation rate: R2-R1 8/11 (ChatGPT), R2-R2 0/8, R2-R3 0/6.

**Headline architectural shifts vs the R1 narrow scope:**
- **`seller_debts` + `seller_debt_events` + `payout_hold_freezes` tables** for tracking platform-owed amounts and multi-reason hold freezes (debt + dispute can coexist on the same hold). Replaces the R2-R2 split-state approach (`frozen_for_debt` / `frozen_for_dispute` as distinct statuses) with a single generic `frozen` status + freeze-reasons table.
- **Split refund primitives** `postTransferRefundSellerInitiated` / `postTransferRefundAdminCancel` with no shared `policy` parameter. Three monomorphic typed entrypoints (`SellerCaller`, `AdminCaller`, `DisputeCaller`); `AdminCaller` carries `debtPolicy` as a discriminated variant constructed from a literal at split admin routes (`POST /v1/admin/orders/:id/cancel/strict` and `.../cancel/absorb`).
- **`cancel_requested` order state** with state-machine-level `markShipped` block (returns 409, not just a UI warning). Auto-promotion uses real columns: `orders.trackingNumber`, `lastTrackingStatus`, `lastTrackingEventAt` (all populated by Starshipit webhook). 72h wall-clock safety net + admin alert at 24h, routed to `review_queue`.
- **`failure_provenance` column** on `payment_operations` distinguishing `auto_timeout_unverified` / `operator_verified_absent` / `stripe_confirmed_failed` (also `cron_retry_exhausted`, `idempotency_conflict` reserved). Enables widened retry gate + late-webhook resurrection of cron-auto-failed ops via new `succeedAutoFailedOp` CAS.
- **Daily reconciliation cron** uses `stripe.refunds.list({ payment_intent })` + `stripe.transfers.listReversals(transfer_id)` (NOT lookup-by-idempotency-key — confirmed via Stripe docs research that this isn't a supported operation; idempotency keys are POST dedup, not a GET index). Reconcile path branches on Stripe outcome FIRST, then consults `policy_context.debtPolicy` only inside the failure branch.
- **`adminForceFailOp(opId)`** escape hatch with auto-verification via Stripe List API (not human attestation). Either promotes to `succeeded` (Stripe has the matching object) or to `failed + operator_verified_absent` (genuinely absent). Rejects operator-submitted Stripe IDs already associated with another op.
- **Seller-scoped advisory lock** (`pg_advisory_xact_lock(hashtext('seller_debt_freeze:' || sellerId))`) on both debt-create and debt-resolve transactions to serialise freeze/unfreeze/release-worker paths and close the "seller run" race.
- **`charge.dispute.created` webhook** (#22) freezes holds via the `payout_hold_freezes` table; suspends any pre-existing debt row for the same order via new `seller_debts.status = 'suspended_by_dispute'`; resolves debt to `auto_collected_via_dispute` (dispute won) or `written_off` (dispute lost) on `charge.dispute.closed`.

**Why:** Three rounds of adversarial review with three different models is the same shape that produced ADRs 01-09 and ADR-013. R3 explicitly converged ("convergence profile expected for Round 3 — no new structural problems, just execution edges" — Claude). Locking the R2 design now unblocks parallel implementation work on FM-3/5/6 + the dispute webhook, with the shipped-code launch blockers tracked separately.

**Two open implementation handoffs:**
- [`docs/handoffs/archive/stripe-refund-r2-lb-fixes.handoff.md`](handoffs/archive/stripe-refund-r2-lb-fixes.handoff.md) — THREE shipped-code CRITICAL bugs (shipped via PR #10 + hotfix #11): (1) LB-R2-1 widened idempotency gate at [`refund-service.ts:133-145`](../packages/api/src/lib/refund-service.ts#L133-L145) (gate `refunds` insert on non-terminal `payment_operations` for the PI, including `indeterminate_5xx`), (2) LB-R2-2 out-of-order + concurrent webhook race serialised via `SELECT FOR UPDATE` on the orders row in both reconcile helpers, (3) LB-R2R3-2 `failure_provenance` column + widened retry gate + `succeedAutoFailedOp` resurrection CAS. Self-contained dev prompt with code sketches and test matrices. **Land first** before any FM-3/5/6 work.
- [`docs/handoffs/stripe-refund-r2-council-session.handoff.md`](handoffs/stripe-refund-r2-council-session.handoff.md) — session-level handoff for the master-merge cleanup (commit shape, what to commit and what to skip).

**What this ADR does NOT cover:** AU payments-law memo (LB-1, in flight separately), Radar / seller risk tiering (FM-4 operational policy, separate workstream), MoR/GST tax position (FM-1/2, separate workstream), the full ops console (LB-2, separate workstream).

**R2 implementation handoffs to be dispatched (in rough order):** (1) shipped-code LB fixes, (2) FM-3 `seller_debts` + `payout_hold_freezes` + freeze helpers, (3) daily reconciliation cron, (4) FM-6 split primitives + typed entrypoints + admin route split, (5) FM-5 `cancel_requested` state + Starshipit-derived evidence timer, (6) FM-4 / #22 dispute-freeze webhook + `disputes` table.

**Source docs:** [`docs/gpt-council/stripe-refund-r2-revised-design.md`](gpt-council/stripe-refund-r2-revised-design.md) (the design doc — 38 decisions, ~5000 words), `.review-state-stripe-refund-r2-revised-design.md` (locked session state), `.review-synthesis-stripe-refund-r2-revised-design-r{1,2,3}.md` (per-round synthesis files — gitignored audit trail).

---

## ADR-015: Multi-Vendor Cart — Hybrid Charge Types (12/04/2026)

**Decision:** Piklo uses hybrid Stripe Connect charge types. Single-seller orders use **destination charges** (already built). Multi-seller orders use **separate charges and transfers (SC&T)** — one PaymentIntent for the full cart total, platform creates individual Transfers to each seller post-payment.

**Why:** Multi-vendor cart is a hard product requirement. Stripe destination charges support only one connected account per PaymentIntent, making multi-seller checkout impossible without N PIs (which triggers N 3DS challenges — a UX dealbreaker confirmed by 3/3 council models). Stripe explicitly recommends SC&T for "marketplaces that need to split payments between multiple parties." Mixing charge types is officially supported. 3 independent web searches (R3) confirmed no new Stripe primitive exists that changes the calculus.

**Supersedes:** The single-seller bag constraint (which would have used FM-F2-REPLACE "Replace bag?" modal). The `SellerMismatchError` in `cart/service.ts` is removed. `checkout_sessions` table is replaced by `order_groups` (single-seller = one-allocation group with `charge_type='destination'`).

**Key schema:** `order_groups` (orchestration entity, replaces checkout_sessions), `order_group_seller_allocations` (per-seller ledger), `order_group_allocation_items` (per-item granularity for refunds), `allocation_refunds` (transfer reversal tracking).

**SC&T payment flow:** single cart → `POST /checkout-groups/quote` snapshots allocations → `POST /checkout-groups/:id/payment-intent` creates one PI (SC&T) → browser `stripe.confirmPayment` (one 3DS) → webhook `payment_intent.succeeded` → async BullMQ fan-out creates N Transfers with seller readiness gate → N seller sub-orders.

**SC&T refund model:** two WAL ops per item — transfer reversal FIRST (returns funds to platform balance), then PI partial refund. Platform balance exhaustion risk if sequenced incorrectly.

**New launch blockers:** LB-M1 (allocation conservation: payouts + platform fee = captured charge), LB-M2 (idempotent fan-out: webhook replay must never create duplicate orders/transfers).

**Regulatory:** Stripe holds AFSL #517024 in AU. Platform never touches buyer funds directly. Envato/Redbubble operate same model. $500-800 AUD lawyer consult required before multi-seller go-live.

**Timeline:** 6 weeks (consensus 5-7 across 3 models).

**Migration path at scale:** Stripe Connect → Adyen for Platforms / managed payments → in-house wallet (requires AFSL/e-money licence). The `PaymentProvider` interface extraction is the bridge.

**Council evidence:** 3 rounds + 3 research reports. R1 split 2-1 (SC&T vs manual capture), resolved by research 286/287/288. R2 produced schema + state machines + 5 critical implementation findings. R3 web-search validation confirmed no better alternative exists (3/3 HIGH confidence). Session state: `.review-state-phase-4-multi-seller-bag.md`. Synthesis: `.review-synthesis-phase-4-multi-seller-bag-r2.md`.

**Legal-consult status (updated 19/04/2026):** the `$500–800 AUD lawyer consult required before multi-seller go-live` item is consolidated into ADR-018 (AML/CTF posture) as the single authority for legal-engagement scope and timing.

---

## ADR-016: Order-number format — dual sequence, `PKL-G-NNNNNN` (groups) and `PKL-S-NNNNNN` (orders) (19/04/2026)

**Decision:** Use two Postgres sequences with `PKL-` prefix projection for human-readable identifiers at two scopes:
- `order_groups.order_number TEXT UNIQUE NOT NULL` — format `PKL-G-000001` (checkout unit, customer-facing primary identifier in emails and support interactions).
- `orders.order_number TEXT UNIQUE NOT NULL` — format `PKL-S-000001` (per-seller split, used in per-seller notifications and admin allocation views).

Both driven by dedicated Postgres sequences (`piklo_order_group_seq`, `piklo_order_seq`). Generation via `DEFAULT` expression at `INSERT` time so the BullMQ fan-out workers receive the number atomically without application-layer coordination. ULID / UUID primary keys are retained for API idempotency and internal joins; `order_number` is display-only.

**Why:** ADR-015's multi-seller cart splits one checkout into N `orders` rows. A buyer who completed one checkout should cite one primary identifier (`PKL-G-000001`) in support interactions; each per-seller split also needs its own spoken identifier for seller-side support, per-order refund receipts, and admin ledger views. A single `orders`-scoped number would ambiguate which split a customer was referencing when a multi-seller checkout produces three numbers. Postgres sequences give transaction-safe uniqueness without the row-lock contention of an `order_sequences` coordination table, and survive worker crashes without gap anxiety at launch volume (<100/day → ~1000/day in 12 months).

**Rejected alternatives:**
- Dedicated `order_sequences` table with row-lock — adds a chokepoint inside the async worker pool for no benefit over native Postgres sequences at this scale.
- UUID substring (`PKL-A3F7B2`, 6 hex chars) — 16M collision space reachable at 18–24 months, harder to speak aloud, still requires the same DB uniqueness constraint.
- Exposing ULID PK in UI — 26-char alphanumeric fails the customer-support "speak aloud" requirement.
- Single `orders.order_number` only — ambiguates multi-seller checkout references (council Critic's decisive point).

**W3 implementation notes:**
- Two `CREATE SEQUENCE` statements + two column additions in a single migration under `packages/db/migrations/`.
- Column default: `'PKL-G-' || LPAD(nextval('piklo_order_group_seq')::text, 6, '0')` (and analogous for orders).
- Add `CREATE INDEX` on both `order_number` columns to support prefix search in the admin orders view.
- Ensure the ORM does not override `order_number` on insert — exclude from INSERT column lists so the `DEFAULT` expression fires.
- Sequence gaps are expected (rolled-back transactions consume values). Document for support.
- No multi-region sharding at launch — sequence instance-scoping is acceptable.

**Council evidence:** one round, 3 Sonnet agents (19/04/2026). Architect + Pragmatist converged on single-scope sequence-based generation; Critic flagged the unit-of-identity issue (per-order vs per-order-group); user steered to dual-scope as the unambiguous resolution. No gpt-council round — UX / data-modelling call, single round sufficient.

---

## ADR-017: Stripe reserve disclosure — pre-Connect block + payout-email reinforcement (19/04/2026)

**Decision:** Surface the 10–25% Stripe platform-reserve possibility to sellers at two disclosure points:

1. **Pre-Connect: disclosure block on the `/become-a-seller` landing page** (Sprint 1b W5 build). A non-collapsible, always-visible `DisclosureBlock` component rendered above the "Connect with Stripe" CTA. Conditional framing — "Stripe may hold a reserve..." not "will" — to avoid stale-disclosure when Stripe removes the reserve. Checkbox-gated CTA creates a logged acceptance event.
2. **Post-payout: contextual footer in the seller payout email** (triggered by `transfer.created` webhook). When the transfer amount is materially less than the corresponding order total due to reserve deduction, the footer explains the reserve as the reason — the highest-trust educational moment because it is observable and concrete. No new notification infrastructure is required; this adds a template variable to the existing payout email.

The disclosure copy itself is not defined in this ADR — it is a Sprint 1b W5 frontend task. This ADR fixes only the placement, trigger points, and the policy rationale.

**Why:** Piklo cannot inject content inside Stripe's hosted Connect Express flow (rules out a Connect-interstitial option). A single pre-Connect disclosure matches the ACL "clear and prominent" test for material terms that affect a seller's cash flow; the post-payout email reinforcement is the moment the reserve becomes observable to the seller, maximising comprehension at the expense of zero additional channels. A three-touchpoint defence-in-depth was rejected as banner-blindness with extra steps — a seller who clicks past the same disclosure three times has weaker informed-consent evidence than one who accepts it once prominently. The ACL framing is anchored on sellers who may become "in trade or commerce" over time (ACL s3 definition); applying the disclosure uniformly is cheaper than maintaining per-seller classification.

**PAYMENT-FLOW.md anchor:** the policy commitment that "seller onboarding copy must communicate this" lives at `docs/PAYMENT-FLOW.md:36–38`; ADR-017 locks the how and when.

**Rejected alternatives:**
- Pre-Connect only — loses the highest-comprehension reinforcement moment (payout reality).
- Full defence-in-depth (three touchpoints including a Connect-flow interstitial) — impossible inside Stripe's hosted flow; defence-in-depth on the remaining two would risk banner blindness.
- Deferring the ADR to W5 kickoff — the placement decision is a policy matter, not a page-design matter; W5 implements the copy.
- Verify-with-Stripe-first — the ADR commits to disclosure regardless of whether the reserve is currently applied to Piklo's Connect account, because the policy question is whether Piklo should disclose in the general case; reserve policy can change at any time.

**W5 implementation notes:**
- Whitelabel channels: disclosure copy pulled from a single channel-config content key (e.g. `disclosure.stripe_reserve`). Channels MAY brand the container but MUST NOT omit the substantive text. Enforce via channel-config schema required field.
- Payout email template: extend to accept `reserve_deducted_amount` and `transfer_amount`. When the difference is non-zero, render the reserve-explanation footer paragraph.
- No new tables required at launch (checkbox acceptance stored client-side). A future `seller_onboarding_events` table can be added if legal evidentiary logging becomes required — Phase 2.

**Council evidence:** one round, 3 Sonnet agents (19/04/2026). Critic's concerns (reserve-may-not-apply, Stripe-already-discloses, ACL-misapplied-to-private-sellers) are acknowledged — conditional language and the "general policy disclosure" framing mitigate them. User steered to the two-touchpoint middle option after Pragmatist's one-touchpoint proposal and Architect's three-touchpoint defence-in-depth. No gpt-council round — UX / compliance call.

---

## ADR-018: AML/CTF posture — provisional s63A(4) incidental-transfer framing with binding operational controls (19/04/2026)

**Status:** PROVISIONAL — supersede on receipt of a written solicitor opinion.

**Decision:** Piklo V2 operates under a provisional compliance posture limited to a s63A(4) AML/CTF Act (Cth) Part 5 "incidental transfer of value" characterisation. Operative assumptions:
1. Stripe (AFSL #517024) provides the licensed payment-processing function; Piklo holds no AFSL.
2. For destination charges (single-seller carts), funds flow buyer → seller Connect account without transiting Piklo's balance.
3. For SC&T (multi-seller carts per ADR-015), the platform-balance transit is engineered to be transient and fully automated via BullMQ fan-out.

**This is not a whole-of-Act exemption.** It is a Part 5 characterisation only. There is no current basis identified for remittance-dealer registration under ss50–51 / s74 of the Act, subject to the binding operational controls and re-review triggers below.

**Posture framing note:** the ADR explicitly adopts the narrower "provisional Part 5 incidental-transfer analysis" language proposed by external review (Gemini + ChatGPT, 19/04/2026) rather than a broader "exempt from AML/CTF Act" reading. R268 (`~/obsidian-vault/piklo/research/strategy/02-deep-dives/research-268-austrac-kyc-acl-compliance.md`, 28/03/2026) is the working internal evidence base; a written solicitor opinion is the authoritative supersession source.

**Launch-readiness gate — ADVISORY, not blocking.** A written solicitor opinion is strongly recommended before public launch (scoped $1.5–3K for AUSTRAC-specific opinion, $5–8K for a bundled review including Privacy Policy + ToS). Launching without the opinion is a deliberate acceptance of unquantified regulatory exposure as a product risk, mitigated by the binding controls below. The ADR records this as explicit informed acceptance, not silent oversight.

**Consolidation:** ADR-018 absorbs the `needs legal review before scale` flag from ADR-011 and the `$500–800 AUD lawyer consult required before multi-seller go-live` item from ADR-015. Those earlier ADRs retain their original wording; the legal-consult line items now route through ADR-018 as the single authority.

**Binding operational controls (launch-blocking at code level):** these are mandatory compensating controls that support the Part 5 incidental-transfer characterisation. They are engineering requirements, not aspirations.

1. **SC&T fund transit is fully automated.** No human touch-points for routine transfer execution; no manual hold/release of seller funds on the platform balance.
2. **Zero-balance enforcement.** If the BullMQ fan-out worker fails to complete an SC&T transfer within 60 minutes of `payment_intent.succeeded`, the system MUST auto-refund the buyer and mark the order failed. Piklo does not hold funds overnight for manual retry.
3. **No internal stored value at launch.** No seller wallets, no credits, no store credit, no netting of orders against each other. Seller proceeds may only settle via immediate Stripe Transfer.
4. **Audit logs mandatory.** Every SC&T transfer emits a structured log of `payment_intent_id`, `transfer_id`, destination account, latency (webhook → transfer completion), and outcome. Retained ≥ 7 years per AML/CTF record-keeping norms.
5. **Hard per-cart cap at launch.** Multi-seller cart total capped at a product-decision threshold (external review recommended AUD $1,000 — finalise in Sprint 1b W3 product scope). Single-seller destination-charge carts are not capped.
6. **ToS prohibits ABN-registered commercial sellers at launch.** Private individuals only. Seller registration form blocks ABN entry. This preserves the "private wardrobe clearer" cohort framing that supports the incidental-services characterisation.

Any code change that weakens these controls forces a Priority 1 ADR re-review.

**Re-review triggers (automatic reopening):** operational triggers matter more than GMV scale alone.

*Fund-holding / operational:*
- First production multi-seller SC&T payment (capture + verify control set live).
- Any SC&T transfer delay exceeding same-day / next-business-day.
- Any manual hold/release of seller funds on the platform balance.
- Any payout retry or worker failure leaving funds in the platform balance beyond the 60-minute zero-balance window.
- Stripe issues a reserve, account review, payout restriction, or AML information request.
- Migration off Stripe as MoR (e.g. to Adyen per ADR-015 migration path).

*Product scope:*
- Any seller wallet / credits / stored value feature.
- Any netting of orders against each other.
- Any crypto, BNPL, or non-AUD payment integration.
- Any geographic expansion outside AU (buyer or seller).
- Addition of rentals or services (triggers ATO SERR separately — see Adjacent obligations below).

*Commercial / risk:*
- Piklo acquires AFSL or takes custody of funds in its own right.
- Meaningful share of GMV from commercial / frequent / ABN-registered sellers (threshold to be set in W3 analytics).
- AUSTRAC publishes guidance contradicting s63A(4) reading for marketplaces.

*Volume / scale:*
- Monthly GMV > AUD $50K.
- Active seller count > 500.
- Chargeback rate > 1%.

*Pattern triggers (compliance monitoring):*
- Repeated high-value items from same seller.
- Refund / chargeback / relist loops.
- Linked-account patterns.
- Persistent name mismatches across buyer, seller, payout account, shipping recipient.
- Single user executing > AUD $1,000 combined buy/sell volume within a 72-hour window (velocity / structuring typology).

**Adjacent Australian obligations (outside AML/CTF Act, flagged here for coherence):**

- **Privacy Act 1988 (Cth):** APP obligations + Notifiable Data Breaches scheme attach if Piklo is determined to be a reporting entity under AML/CTF, regardless of the $3M small-business threshold. Re-review trigger: reaching $3M turnover or being classified as a reporting entity.
- **ATO Sharing Economy Reporting Regime (SERR):** EDP operators facilitating goods transactions (where ownership changes hands) are NOT currently required to report under the ATO EDP guide (as at 04/2026). Re-review trigger: addition of rentals, services, or any supply that is not a goods-ownership transfer.
- **ASIC Non-Cash Payment Facility (NCPF) — Corporations Act 2001 Ch 7:** adding stored value (wallets, reloadable credits, internal credits funded by sale proceeds) likely creates an NCPF that requires reliance on the ASIC Corporations (Non-Cash Payment Facilities) Instrument 2016/211 low-value exemption, with specific hold limits and user disclosures in ToS. Re-review trigger: any stored-value feature proposal.

**Evidence / inputs:**
- R268 (AI-generated internal research, 28/03/2026) — s63A incidental-services framing.
- Council session 19/04/2026 — Architect / Critic / Pragmatist Sonnet agents.
- External review 19/04/2026 — Gemini + ChatGPT one-shot reviews; both narrowed the posture language, flagged SC&T fund-transit as the weak point, and recommended binding operational controls as the coherence anchor for the ADVISORY framing.
- ADR-011 (separate charges and transfers model) and ADR-015 (multi-vendor cart hybrid charges) — legal-consult items merged here.

**Supersession:** this ADR is provisional. On receipt of a written solicitor opinion, ADR-018 is superseded or updated to lock the posture based on authoritative legal analysis. Until then, the binding operational controls above are the compensating mechanism.

---

## Council-Reviewed Design Decisions

> These decisions were confirmed through multi-model adversarial review
> (GPT-Council: Gemini + Claude + ChatGPT). They represent point-in-time
> rationale that should be revisited as the project evolves. Full context
> lives in the `.review-state-*.md` files at repo root (gitignored — only
> present in working copies that have run council sessions).

### Trust Layer (phase-3a-trust-layer)

| # | Decision | Round |
|---|----------|-------|
| 1 | 4 binary scoring dimensions (defer pricing); app-level JSON for saved search filters | R0 |
| 2 | Always-on `listingScore:desc` ranking rule + sortable + `qualityTier` filterable (MeiliSearch research validated) | R0 |
| 3 | One score row per listing, `UNIQUE(channel_listing_id)`; `quality_tier` derived at query/sync time, not stored | R0 |
| 4 | Nudge messages via config lookup, not LLM; listing report action reversible via `hidden_at` | R0 |
| 5 | `listing.visibility_changed` domain event for MeiliSearch sync; `listing_score: 0` default in transformer | R0 |
| 6 | One MeiliSearch writer — visibility changes in existing `search-sync.ts` | R0 |
| 7 | Saved search `query_hash = sha256(normalise(query) + sortKeysRecursive(filters))` | R0 |
| 8 | Basic notification service — BullMQ dispatch + email via existing `email.ts` | R0 |
| 9 | Backfill job + staged ranking rollout for existing listings | R1 |
| 10 | `content_changed` event trigger for score recalculation on listing edits | R1 |
| 11 | `hidden_at IS NULL` filter in all listing read paths | R1 |
| 12 | Report action atomicity — same transaction for `hidden_at` + report status | R1 |
| 13 | Report state machine reinstatement: `actioned → reviewed`, `dismissed → reviewed` | R1 |
| 14 | Split migration: shared schema first, then per-module | R1 |
| 15 | Notification durability — update status in email worker, add stale sweeper | R1 |
| 16 | Notification dedup includes `entity_id` parameter | R1 |
| 17 | Seller score endpoint requires ownership check | R1 |
| 18 | `shouldIndexListing()` predicate — all search-sync paths check `hidden_at` before indexing | R2 |
| 19 | Derive `hidden_at` from report state — hidden iff any actioned report exists | R2 |
| 20 | Notification sweeper checks BullMQ job state before re-enqueue | R2 |
| 21 | `content_changed` dispatch sites enumerated as checklist | R2 |
| 22 | Report rate limit — 10/day per user | R2 |
| 23 | `channelId` added to `sendNotification()` and `dedup_key` | R2 |
| 24 | `dispatchEvent()` fires post-commit (verified via research) | R2 |
| 25 | Deploy order: `hidden_at` foundation as Step 0, wishlist/saved-searches independent | R2 |
| 26 | Notification trigger matrix defined: score_nudge → seller, report_actioned → seller, report_reinstated → seller | R3 |
| 27 | Nudge dedup includes `nudge_key` — allows tier progression on same day | R3 |
| 28 | Tier cutoffs: 0–49 bronze, 50–74 silver, 75–100 gold | R3 |
| 29 | Sweeper `jobId = notification_id` at enqueue time | R3 |
| 30 | Reconciliation job for search drift (replaces "daily re-index" claim) | R3 |

### Commerce Hardening (phase-3a-hardening)

| # | Decision | Round |
|---|----------|-------|
| 1 | Notification enqueue deferred to `afterCommit` to prevent phantom BullMQ jobs against rolled-back rows | R1 |
| 2 | `sending` status + lease added for duplicate-send prevention; worker claims atomically before send | R1 |
| 3 | Sweeper uses atomic `UPDATE...RETURNING` to claim rows — eliminates check-then-enqueue race | R1 |
| 4 | Pass `Idempotency-Key` header to Resend — 24h dedup window (post-research OC-2) | R1 |
| 5 | `FOR UPDATE` lock on `channel_listings` during report transitions — serialises `hidden_at` recomputations | R1 |
| 6 | Seller publish/unpause gated on `hidden_at IS NULL` — prevents seller racing admin moderation | R1 |
| 7 | Defer `manual_hidden_at` to Phase 3b; `FOR UPDATE` is the critical fix for 3a | R1 |
| 8 | `scored_from_version` column + guarded UPSERT — stale scoring jobs cannot overwrite newer scores | R1 |
| 9 | Drop remove-then-add debounce; use stable `jobId` — replaces three non-atomic BullMQ calls | R1 |
| 10 | Partial unique index `WHERE status NOT IN ('dismissed')` for listing reports — allows re-reporting | R1 |
| 11 | Drop `channel_id` from `listing_reports` — derive via JOIN to eliminate silent drift | R1 |
| 12 | New row on re-report (not reopen old row) — preserves audit trail | R1 |
| 13 | Explicit `visibility_changed` dispatch conditional on state change (MeiliSearch sync only on actual transition) | R1 |
| 14 | Sort primitive arrays before hashing saved-search filters — `["M","L"]` and `["L","M"]` must hash identically | R1 |
| 15 | Atomic `INSERT` with count subquery for saved-search cap enforcement — single statement | R1 |
| 16 | Wishlist `POST` returns 200 via `ON CONFLICT DO NOTHING` — 409 was wrong UX | R1 |
| 17 | Defer dead wishlist row cleanup — lazy filtering sufficient for Phase 3a | R1 |

### Disputes & Refunds Design (phase-3b-disputes-refunds)

| # | Decision | Round |
|---|----------|-------|
| 1 | Close all 5 open schema/state-machine/API questions with v1 defaults | R1 |
| 2 | INR gate: `shipped_at + 14 days + 3-day buffer` (`created_at` starts clock too early) | R1 |
| 3 | Add `source` + `provider_dispute_id` to disputes — prevents Stripe/self-serve duplicates | R1 |
| 4 | Verify Phase 2B service extraction before Step 0 (inline extraction = 1–2 days) | R1 |
| 5 | Notification enhancements deferred — orthogonal to money movement | R1 |
| 6 | Sweeper: `attempt_count` + backoff, max 3 retries — prevents retry storm | R1 |
| 7 | Freeze/unfreeze as a single transactional function — split risks partial failure | R1 |
| 8 | Row-level lock (not `FOR UPDATE` + aggregate) — PG limitation confirmed via research | R1 |
| 9 | Partial refund primitive must ship before dispute routes — invariants must be stable first | R1 |
| 10 | EFW pre-empts manual dispute — both can arrive for same order | R1 |
| 11 | `freeze_reasons`: array + transactional function; backfill + dual-write for mixed-version deploy | R1 |
| 12 | Metrics/alerts as definition-of-done — silent failures unacceptable | R1 |
| 13 | Three-way race + live migration integration tests required | R1 |
| 14 | Dispute creation = single DB transaction — financial leak if freeze fails | R2 |
| 15 | `has_open_dispute` overlay (NOT a `disputed` order status) — preserves Starshipit CAS | R2 |
| 16 | `partially_refunded` as distinct outcome — buyer locked out on partial without it | R2 |
| 17 | BullMQ: cron reconciler + per-timer DB fields (delayed jobs were over-engineered) | R2 |
| 18 | Sweeper uses `scheduled_at` for quiet-hours compatibility | R2 |
| 19 | Dispute window per reason must be >= Stripe 120 days — false safety otherwise | R2 |
| 20 | `resolution_code` enum defined — freeform varchar is unqueryable | R2 |
| 21 | Tests gate each deploy step — monolithic tests at the end produce late bugs | R2 |
| 22 | Evidence flow step added to deploy order — core to disputes | R2 |
| 23 | `provider_dispute_id` partial unique index — prevents webhook retry duplicates | R2 |
| 24 | Channel scoping derived server-side + DB constraints — prevents cross-channel leakage | R2 |
| 25 | `pre_dispute_status` removed — `has_open_dispute` overlay makes it unnecessary | R3 |
| 26 | Resolution path must be transactional (same as creation) — `has_open_dispute` divergence risk | R3 |
| 27 | Payout release + delivery notifications must check `has_open_dispute` — side-effects must not fire during active investigation | R3 |
| 28 | Status × `resolution_code` matrix with validation — prevents impossible combinations | R3 |
| 29 | `processPartialRefund`: lock → compute → insert intent → commit — race if intent inserted after commit | R3 |

### Stripe Money Flow & Admin Cancel (stripe-money-flow-and-admin-cancel)

| # | Decision | Round |
|---|----------|-------|
| 1 | Commission AU payments-law memo before scale — AFSL/PPF exposure, 3–6 month lead time | R1 |
| 2 | Minimal ops console + runbook before scale — unbounded silent loss without control loop | R1 |
| 3 | Add `unknown_after_5xx` WAL state + Stripe-object reconciliation — Stripe 5xx breaks WAL-only guarantee | R1 |
| 4 | Add `seller_debts` table + fail-loud admin cancel — absorbed reversals silently drain platform | R1 |
| 5 | Written MoR + GST tax position document — internal contradictions + GST timing risk | R1 |
| 6 | Dispute-freeze webhook (#22) + Radar + seller holdback before $50k/day threshold | R1 |
| 7 | `cancel_requested` intermediate state for physical-world race — CAS doesn't fence side effects | R1 |
| 8 | Refactor `processRefund` → `preTransferRefund`/`postTransferRefund` primitives with typed entrypoints | R1 |
| 9 | Gate refund-row insertion on no prior succeeded operation for same PI — prevents double refund | R1 |
| 10 | Pre-create reversal `payment_op` before marking refund op succeeded (FM-8) — closes stuck-state gap | Research |
| 11 | Doc disambiguation: refund-first for seller refund, reversal-first for admin cancel (FM-9) | Research |

### Phase 4 Implementation Plan (phase-4-implementation-plan)

| # | Decision | Round |
|---|----------|-------|
| 1 | Use `unstable_rethrow` at call sites (FM-11) — `isNotFoundError` doesn't exist in Next.js 15 | R2 |
| 2 | Defer token exchange — per-domain auth at launch (FM-15) — over-engineered for 2 channels | R3 |
| 3 | Split Sprint 0.5 into 0.5a + 0.5b (FM-16) — 25–30 files unrealistic for solo dev in 3–4 days | R3 |
| 4 | CSRF `X-Requested-With` check on `/api` proxy (FM-17) — open proxy without CSRF protection | R3 |
| 5 | Cache invalidation via Server Actions + `revalidateTag` (FM-18) — client mutations bypass Next.js cache | R3 |
| 6 | Forward `X-Forwarded-For` in proxy middleware (FM-19) — rate limiting and fraud detection need real client IP | R3 |

### Checkout Slice (phase-4-checkout-slice) — LOCKED 12/04/2026

> **ADR-015 reconciliation (R3):** All 50 decisions mapped against ADR-015 (multi-vendor cart).
> 33 SURVIVES (entity-agnostic), 13 ADAPTED (target changes from `checkout_sessions` to `order_groups`),
> 4 SUPERSEDED (FM-F2-REPLACE replace-bag, FM-ORDER 12-step sequence, sprint ordering, sprint 1a/1b split).
> Safety patterns (WAL, confirming, reconciler, refund flags, readiness gates) carry forward into `order_groups`.

| # | Decision | Round |
|---|----------|-------|
| 1 | Foundation decisions inherited: `[channel]` routes, API clients, `cacheTag()`, Server Actions, `requireAuth()`, PostHog, `publicHref()`, CSRF, per-domain auth | R0 (inherited) |
| 2 | Backend is Fastify + BullMQ (corrected from NestJS via code audit of `packages/api/src/server.ts`) | R1 |
| 3 | Post-0.5 sprint order: publish → PDP → bag → checkout → order confirmation before seller dashboard breadth | R1 |
| 4 | `createAuthedApiClient` forwards `Host`/`X-Forwarded-Host` and injects `X-Requested-With` header | R1 |
| 5 | Cache invalidation matrix: mutations invalidate item AND collection tags (`revalidateTag` exact-match only) | R1 |
| 6 | Sign-out sequence: tab broadcast BEFORE `router.refresh()`/redirect | R1 |
| 7 | Middleware split: edge does rewrite+gating only; CSRF moves to `/api` Route Handler (only CSRF line) | R1 |
| 8 | `[channel]/loading.tsx` required in 0.5a; Label primitive moves from 0.5b into 0.5a | R1 |
| 9 | Local multi-host strategy defined in 0.5a (`/etc/hosts` + preview domains + `Host`-header harness) | R1 |
| 10 | LB-F3-PAY: Dedicated `POST /api/v1/store/checkout/:id/pay` with pay-time re-check (re-run `assertCheckoutReady` + recompute live totals + verify reservability) → typed 409 `CHECKOUT_STALE` | R1 |
| 11 | LB-F8-WAL: Wrap `stripe.paymentIntents.create` in payment-operations WAL; idempotency key = `sessionId` (never rotated); boolean `has_pending_reconciliation` + `reconciliation_locked_until` on `checkout_sessions` | R1 |
| 12 | LB-F10-CONFIRMING: New `confirming` state in checkout state machine; expiry worker skips `confirming`, reschedules +15min grace window | R1 |
| 13 | FM-F2-REPLACE: `replaceBagAndAddItem` Server Action + "Replace bag?" modal + `BroadcastChannel` for background tabs + `revalidateTag` (both/and, not either/or) | R1 |
| 14 | FM-ORDER: Sprint 1b implementation order is backend-contract-first (state machine → WAL → /pay route → readiness → replaceBag → backend tests → parallel UI) | R1 |
| 15 | Wizard draft+manifest ADR: `DRAFT` row on Start listing, ULID prefix, R2 lifecycle rule (~48h worst-case deletion), server manifest, enrichment from committed snapshot | R2 |
| 16 | Publish idempotency ADR: version column, 409 on mismatch, `publishDraft({draftId, version, idempotencyKey})` | R2 |
| 17 | Stripe Connect onboarding UI lands in Sprint 1b; `publishDraft` gate checks `charges_enabled` + `payouts_enabled` + `requirements.currently_due` | R2 |
| 18 | `cookies()` and `headers()` are async in Next.js 15+ — all samples and call sites must `await` | R2 |
| 19 | Route Handler is the only `/api` proxy mechanism; `next.config` `rewrites()` deleted | R2 |
| 20 | Sprint 1 split into 1a (wizard → publish → PDP) and 1b (bag → checkout → order confirmation + Stripe onboarding UI) | R2 |
| 21 | Mutation strategy: Server Actions for cache-affecting mutations; direct `PATCH` only for ephemeral draft autosave | R2 |
| 22 | Server clients call Fastify directly; only browser client uses `/api` proxy; MeiliSearch queries via `/api/search` handler | R2 |
| 23 | LB2-F7-GUARDRAIL: Shipped split-guardrail tightened to conjunctive/fail-closed — `reverse_transfer` always true for dest charges; halt for manual review if fee > 0 but no `transfer_data.destination` | R2 |
| 24 | Named integration test file for every LB/FM (8 test files specified) | R2 |
| 25 | Three audit patterns for stashed Sprint 1b code: raw SQL bypass, WAL ordering violation, idempotency key rotation | R2 |
| 26 | Reconciler `list()` must paginate via `starting_after` until exhausted; widen lookback to `op.createdAt + margin` | R2 |
| 27 | Steps 2 (WAL) and 3 (/pay route) have hard dependency — ship sequentially, not in parallel | R2 |
| 28 | Set `stripe-node maxNetworkRetries: 0` explicitly — SDK retry races the reconciler | R2 |
| 29 | `visibilitychange` event listener on bag/checkout layout → `router.refresh()` on resume | R2 |
| 30 | LB-F8-WAL-WORKER: `reconcile-indeterminate-ops` worker is a dead export — must be registered in `workers/index.ts` as BullMQ repeatable job (post-research) | Research |
| 31 | LB-F7-REFUND-FLAGS: `handlePaymentAfterExpiry()` refund must pass `reverse_transfer: true` + `refund_application_fee: true` — Stripe defaults both to `false` (post-research) | Research |

### Wizard & Browse (phase-4-wizard-browse)

| # | Decision | Round |
|---|----------|-------|
| 1 | Foundation decisions inherited: `[channel]` routes, API clients, `cacheTag()`, Server Actions, `requireAuth()`, PostHog, `publicHref()`, CSRF, per-domain auth | R0 (inherited) |
| 2 | Post-0.5 sprint order: publish → PDP → bag → checkout → confirmation before seller dashboard breadth | R1 |
| 3 | `createAuthedApiClient` forwards `Host`/`X-Forwarded-Host`, injects `X-Requested-With`, forwards `x-forwarded-for` + `x-real-ip` | R1/R2 |
| 4 | Cache invalidation matrix: mutations invalidate item AND collection tags | R1 |
| 5 | Sign-out sequence: tab broadcast BEFORE `router.refresh()`/redirect | R1 |
| 6 | Middleware split: edge = rewrite+gating only; CSRF moves to proxy handler (only CSRF line) | R1 |
| 7 | 0.5a DoD adds 3 Playwright smokes (channel isolation, cross-tab sign-out, CSRF rejection) + 1 `revalidateTag` integration test | R1 |
| 8 | `[channel]/loading.tsx` required in 0.5a; Label primitive moves from 0.5b into 0.5a | R1 |
| 9 | Wizard draft: `DRAFT` row on Start listing, ULID prefix, ~48h worst-case R2 lifecycle deletion, server manifest | R2 |
| 10 | Publish idempotency: version column, 409 on mismatch, `publishDraft({draftId, version, idempotencyKey})` | R2 |
| 11 | `publishDraft` gate: block on `!charges_enabled`; soft-block/warn on `!payouts_enabled`; surface `requirements.currently_due` | R2 |
| 12 | `cookies()` and `headers()` are async in Next.js 15+ (OC-4 validated — unchanged in 16.2.3) | R2 |
| 13 | Route Handler is the only `/api` proxy mechanism; `next.config` `rewrites()` deleted (OC-5 validated) | R2 |
| 14 | Sprint 1 split: 1a (wizard → publish → PDP min) + 1b (bag → checkout + Stripe onboarding UI) | R2 |
| 15 | Host precedence contract: `X-Forwarded-Host` if trusted else `Host`, validated against channel-config allowlist | R2 |
| 16 | Mutation strategy: Server Actions for cache-affecting; direct `PATCH` only for ephemeral draft autosave | R2 |
| 17 | Server clients call backend directly; only browser client uses `/api` proxy; MeiliSearch via `/api/search` | R2 |
| 18 | Search hydration `queryKey` bound to `useSearchParams()`; discard stale `initialData` if params don't match | R2 |

### Sprint 2 Planning (phase-4-sprint-2)

| # | Decision | Round |
|---|----------|-------|
| 1 | Foundation + wizard-browse decisions inherited (see Wizard & Browse section) | R0 (inherited) |
| 2 | `channel-config.ts` resolver used by metadata + sitemap + OG routes | R0 (inherited) |
| 3 | LB-1: Search hydration handshake — per-request `QueryClient` via `React.cache`, canonical query signature `['listings', channel, surface, target, normalisedParams]`, mismatch-discard protocol | R1 |
| 4 | LB-2: Pagination contract — offset-based (MeiliSearch has no cursor/searchAfter), `maxPages` cap, `AbortSignal` cancellation, response digest guard, `@tanstack/react-virtual` for grid recycling | R1 |
| 5 | LB-3: SEO single URL builder (`src/lib/seo.ts`) — canonical, OG, Twitter, JSON-LD all from `publicHref()`; sitemap reuses same builder | R1 |
| 6 | LB-4: Sold listing handling — 200 OK with JSON-LD `availability: OutOfStock`; 404 for archived/paused; above-fold "Shop similar" rail on sold items | R1 |
| 7 | LB-5: Sprint 0.5–1b retrofit — `'use cache'` directive + `cacheLife()` + two-arg `revalidateTag('tag', 'profile')` across all cached fetches | R1 |
| 8 | FM-1: Anonymous wishlist intent via URL param `?wishlist={listingId}` with `Referrer-Policy: strict-origin-when-cross-origin` on those routes | R1 |
| 9 | FM-2: Image spec — browse card sizes `(min-width: 1024px) 25vw, …`; PDP hero `50vw`; stored `aspect_ratio` in DB; URL versioning on photo change | R1 |
| 10 | FM-3: Related listings = RSC + `<Suspense fallback={<GridSkeleton/>}>` behind skeleton (client-only invalidated by Googlebot 2026 penalty research) | R1 |
| 11 | FM-4: PDP RSC/client boundary — RSC emits title/price/shipping/seller card/first image/JSON-LD; client islands = gallery interaction + wishlist button + report dialog | R1 |
| 12 | FM-5: `experimental.scrollRestoration: true` in `next.config.ts` + Playwright smoke for back-from-PDP | R1 |
| 13 | FM-7: Dynamic OG cards via `next/og ImageResponse` ship in Sprint 2 (promoted from Sprint 4); edge cached indefinitely | R1 (post-research) |
| 14 | FM-8: JSON-LD Product shape — `UsedCondition`, `priceValidUntil = now + 1 year`, seller as `Person` inside `Offer`, `OutOfStock` for sold | R1 (post-research) |
| 15 | SA-1: `QueryClientProvider` scoped to `[channel]` layout; SA-2: explicit `remotePatterns` for media domains | R1 |
| 16 | C4 resolved: Sprint 1a photo upload — Sharp-based 800px thumbnail generation added to enrichment worker firing on `POST confirm` | R1 (post-research) |
| 17 | LB-R2-1: Scroll restoration — `sessionStorage` anchor + `useEffect` + `virtualizer.scrollToIndex`; disable `experimental.scrollRestoration` on virtualised routes | R2 |
| 18 | FM-R2-1: Sprint 0.5c — `'use cache'` at data-fetching function level, named `cacheLife` profiles (`'browse'`/`'listing-detail'`/`'search'`), cache audit matrix; hard gate on Sprint 1a | R2 |
| 19 | FM-R2-2: `aspect_ratio` rollout — BullMQ backfill job + idempotent UPSERT + frontend fallback `?? 0.75`; Sprint 2 ratio-dependent rendering blocked until backfill completes | R2 |
| 20 | FM-R2-3: Dynamic OG failure path — 3s `AbortSignal` on R2 fetch; static branded fallback on timeout; `Cache-Control: immutable` on success | R2 |
| 21 | FM-R2-4: Image variants — `thumb-800` + `hero-1200` + original at upload time; 3 R2 objects per photo (800px single-variant superseded) | R2/R3 |
| 22 | FM-R2-5/R3: Wishlist nonce idempotency — URL shape `?wishlist=…&action=…&nonce={ULID}&exp={unix_ts}`; `sessionStorage` spent-marker; URL cleared BEFORE mutation fires | R2/R3 |
| 23 | FM-R2-7: Per-request `QueryClient` with `gcTime: 0` frees dehydrated data immediately after serialisation; load-test gate: 100 concurrent RSC renders, peak RSS < 200MB | R2 |
| 24 | FM-R2-8: Shared `search-request-builder.ts` — canonical outbound request shape used by both RSC and `/api/search` Route Handler | R2 |
| 25 | SA-R2-1: Sprint 2 contingency cut list — report dialog → static page; OG → static fallback; seller dashboard edit deferred to Sprint 3 | R2 |
| 26 | SA-R2-2: `maxPages` terminal state — per-surface caps (browse 10, search 10, seller profile 5); "End of results" row with manual "Load more" | R2 |
| 27 | FM-R3-1: Scroll anchor refinements — use `useEffect` not `useLayoutEffect`; gate on virtualiser ready; cache-state guard discards stale anchor, toasts "Results refreshed" | R3 |
| 28 | FM-R3-3: Wishlist nonce — extended URL shape with `&exp={unix_ts_seconds}` (5-min expiry); `window.history.replaceState` BEFORE mutation | R3 |
| 29 | FM-R3-4: `aspect_ratio` backfill contract — `backfill_status` column (`populated`/`skipped_corrupt`/`failed_unreadable`); deploy gate keys on zero `NULL AND NULL` rows | R3 |
| 30 | FM-R3-5: MeiliSearch index drift — client-side dedupe by listing id via `useInfiniteQuery.select`; "eventual consistency accepted" | R3 |
| 31 | SA-R3-1: Cache audit matrix CI enforcement — `scripts/cache-audit.sh` greps `'use cache'` + `revalidateTag` call sites and asserts every cached function appears in an invalidation path | R3 |
| 32 | SA-R3-2: OG composition — `hero-1200` composed to 1200×630 at render time via `next/og`; centre-crop landscape, pad portrait with channel-brand background | R3 |

### Multi-Vendor Cart (phase-4-multi-seller-bag) — LOCKED 12/04/2026

Headline decisions from the 30-decision council session. ADR-015 above holds the full architectural decision. Per-decision context lives in `.review-state-phase-4-multi-seller-bag.md` (gitignored). Synthesis in `.review-synthesis-phase-4-multi-seller-bag-r2.md`.

| # | Decision | Round |
|---|----------|-------|
| 1 | Hybrid charge types: destination charge when single seller, separate charges and transfers (SC&T) when multi-seller — selected at quote time by seller count | R1 |
| 2 | `order_groups` replaces `checkout_sessions` as the top-level commerce entity; additive migration (legacy `checkout_sessions` kept functional, frontend cutover in Week 5) | R1 |
| 3 | Per-seller state tracked via `order_group_seller_allocations` — 10-state machine covering reserve → pay → allocate → transfer lifecycle | R1 |
| 4 | `carts.sellerId` removed; `SellerMismatchError` deleted; cart allows items from N sellers and groups at quote time | R1 |
| 5 | `quoteHash = sha256(sorted allocations + amounts)` used as the staleness contract between quote and `/pay` | R2 |
| 6 | WAL-wrapped PaymentIntent creation (LB-F8) — `createPaymentOp` fires BEFORE any Stripe call; 5xx marked indeterminate, reconciled by worker | R2 |
| 7 | Confirming-state grace window (LB-F10) — expiry worker skips `confirming`, reschedules +15min with 2×15min cap to avoid racing 3DS flows | R2 |
| 8 | SC&T refund ordering (LB-F7) — reversal op created first, partial refund second, both in `allocation_refunds`; refund flags conjunctive on destination-charge path | R2 |
| 9 | BullMQ parent/child transfer fan-out — per-allocation `transfers.create` with idempotency key `${orderGroupId}:${allocationId}`; parent aggregates to `allocated` or `partially_failed` | R2 |
| 10 | Migration strategy: additive (no destructive drops). `checkout_sessions` remains for historical data; `orderGroupId` added nullable to `orders`/`payment_operations` | R1 |
| 11 | Platform fee accounting: explicit `orders.platform_fee_cents` remains the source of truth; destination path sets `application_fee_amount` to mirror the same value | R2 |
| 12 | AU AFSL position: destination-charge path avoids platform-held-funds exposure; SC&T path requires legal sign-off (money-transmission / merchant-of-record) before multi-seller go-live | R3 |
| 13 | PaymentProvider interface extraction is the migration bridge to Adyen for Platforms or in-house wallet; out of scope for this sprint | R3 |
| 14 | `visibilitychange` → `router.refresh()` on checkout layout; `BroadcastChannel` + `revalidateTag` for cross-tab bag/checkout sync | R2 |
| 15 | Late-success recovery: webhook extends `handlePaymentAfterExpiry` to order-groups; expired + paid path reactivates or refunds per 15-min window | R2 |
