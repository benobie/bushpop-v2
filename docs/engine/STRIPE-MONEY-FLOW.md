> **Provenance:** engine doc copied from `benobie/piklo-v2` @ `2419a38` at fork time (02/07/2026), with `@bushpop/*` renamed `@bushpop/*`. May drift from upstream — see `docs/engine/FORK.md`.

> **Developer guide:** See [PAYMENT-FLOW.md](PAYMENT-FLOW.md) for the developer-oriented reference. This file is the original design document retained for historical context.

# Stripe Money Flow

> **Decided 08/04/2026** — NEW-002. Model is **separate charges and transfers**, not destination charges. Supersedes the earlier placeholder that said destination charges with `reverse_transfer=true`.

## Overview

- **Model:** Stripe Connect Express with **separate charges and transfers**.
- **Rationale:** Piklo has an inspection/payout-hold window between capture and release. Destination charges move money to the connected account immediately, which is the wrong shape for an escrow/hold. Separate charges let the platform hold funds on its own balance until the `payout_hold` state machine releases them, and keep refund logic simple during the (common) pre-release window.
- **Charge:** Platform `PaymentIntent` on the platform account. No `transfer_data`, no `application_fee_amount`, no `on_behalf_of`. `transfer_group` = `checkout_session_id` (and later `order_id`).
- **Transfer:** On `payout_hold` release, `stripe.transfers.create({ destination: seller_stripe_account, amount: hold.amount_cents, transfer_group: order_id })`, idempotent on `payout_hold_id`.
- **Fee:** Platform fee is simply `total − transferred_amount`. No Stripe-level application fee to reason about.
- **Refunds:**
  - **Pre-release** (no transfer yet, `payout_hold.status ∈ {held, releasing, cancelled}` and `transfer_id IS NULL`): `stripe.refunds.create({ payment_intent })`. No transfer to reverse.
  - **Post-release** (`transfer_id` set): ordering depends on *who initiated the refund*. See §3.5 for the two-path contract — seller-initiated refunds use refund-first-then-reversal; admin cancel uses reversal-first-then-refund (fail loudly). This was the outcome of GPT-Council Round 1 (FM-9).
- **Disputes:** Chargebacks land on the platform account (platform is merchant of record). Budget $25 AUD per dispute.
- **Platform liability:** Stripe fees, refunds, and chargebacks all debit the platform balance. This matches how the payout hold model already works.

## Fee Structure (Piklo channel)

- Platform fee: 8% (800 bps) — taken implicitly as `total − transfer.amount`
- Stripe processing: ~1.75% + $0.30 (domestic cards) — debited from platform balance
- Seller receives: sale price − platform fee (Stripe fees absorbed by platform, already priced into the 8%)

## Sequence

### Happy path

1. Buyer completes checkout → `PaymentIntent.create({ amount, transfer_group: session_id })` on platform.
2. `payment_intent.succeeded` webhook → order `paid`, `payout_hold` row created `held`.
3. Inspection window elapses / buyer confirms receipt → `payout_hold` CAS `held → releasing`.
4. Worker calls `transfers.create({ destination, amount, transfer_group: order_id })` idempotent on `payout_hold_id`.
5. CAS `releasing → released`, store `transfer_id`.

### Admin cancel / refund (pre-release)

1. Validate order cancellable + `payout_hold.status = held`, `transfer_id IS NULL`.
2. `refunds.create({ payment_intent })`.
3. In one DB transaction: order `cancelled`, payout hold `cancelled`, inventory restored. Idempotent on `order_id`.

### Post-release refund — two contracts (decided GPT-Council R1, FM-9)

Post-release refund has two distinct code paths with different invariants. Which one runs depends on *who initiated the refund*.

#### Seller-initiated refund (post-release) — **implemented**

**Invariant:** buyer is always made whole. Platform absorbs reversal failure.

1. Validate `payout_hold.status = released`, `transfer_id` present.
2. `stripe.refunds.create({ payment_intent })` — buyer credited from platform balance.
3. Pre-create a pending `payment_operations` row for the reversal (FM-8 — ensures crash-mid-flow is recoverable). Mark the refund op succeeded; refund row → `pending_reversal`.
4. `stripe.transfers.createReversal(transfer_id)` — claw funds back from seller.
5. On reversal failure (seller insufficient balance / offboarded): buyer is whole, admin alert email sent, platform eats the shortfall. **Does NOT rethrow** — this is a platform-level issue that requires admin intervention. (R2 will persist this as a `seller_debts` row rather than only alerting.)
6. DB transaction: order `refunded`, inventory restored.

Code: [`packages/api/src/lib/refund-service.ts`](../packages/api/src/lib/refund-service.ts) `processRefund` post-transfer branch.

#### Admin cancel (post-release) — **not yet implemented, R2**

**Invariant:** seller is made short before buyer is made whole. Admin cancel fails loudly if it can't guarantee both.

1. Validate `payout_hold.status = released`, `transfer_id` present.
2. `stripe.transfers.createReversal(transfer_id)` first. On failure (seller insufficient balance / offboarded): **return 502, do NOT refund the buyer**, operator must manually resolve. State is clean.
3. `stripe.refunds.create({ payment_intent })` — buyer credited.
4. DB transaction: order `refunded`, payout hold `reversed`, inventory handling per return policy.

**Status:** `POST /api/v1/admin/orders/:id/cancel` currently returns a 409 for released payout holds (see [`packages/api/src/routes/v1/admin/orders/routes.ts`](../packages/api/src/routes/v1/admin/orders/routes.ts)) as a temporary safety net. Full implementation is tracked in R2 alongside the FM-6 split into `preTransferRefund` / `postTransferRefund` primitives and the `seller_debts` table for any cases that fall outside the strict fail-loud path.

## Key Decisions

- **Express accounts** (not Custom) — less compliance burden. Compatible with separate charges and transfers.
- **Separate charges and transfers** (not destination charges) — platform holds funds during inspection window; refunds don't race with payouts.
- **No Stripe application fee** — platform fee derived from the transfer amount. One subtraction, easier reconciliation.
- **Deferred seller KYC** — onboard at first listing, not signup.
- **Architect for Accounts v2 migration** (Express is "legacy").

## Webhooks required

- `payment_intent.succeeded` → mark order paid, open payout hold
- `payment_intent.payment_failed` → release reservations, fail session
- `payment_intent.canceled` → CAS session to cancelled (H-11, Phase 2B)
- `refund.created` / `refund.updated` → LB-3 reconciliation for `indeterminate_5xx` refund ops (keyed on `metadata.piklo_payment_op_id`)
- `charge.refunded` → same reconciliation path (Stripe fans out both events; handler is idempotent)
- `transfer.updated` → LB-3 reconciliation for `indeterminate_5xx` reversal ops (Stripe surfaces new reversals via the updated transfer's `reversals.data` list; there is no discrete `transfer.reversal.created` event)
- `charge.dispute.created` → freeze `payout_hold` (Phase 3b)
- `transfer.failed` → revert `payout_hold releasing → held` (already implemented defensively in worker)

## Open items

- Transfer reversal failure playbook (seller with insufficient balance)
- 1099-K / AU tax reporting — platform is merchant of record under separate model
- Multi-seller cart (future) — separate model handles natively via multiple transfers in one `transfer_group`
