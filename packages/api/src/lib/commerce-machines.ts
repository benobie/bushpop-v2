import type { StateMachine } from "./state-machine.js";
import type {
  CheckoutStatus,
  OrderStatus,
  PayoutHoldStatus,
  OrderGroupStatus,
  SellerAllocationStatus,
} from "@bushpop/types";

// ---------------------------------------------------------------------------
// Checkout Session State Machine
// ---------------------------------------------------------------------------
//
// Status transitions use compare-and-set (CAS) via the `version` column:
//
//   UPDATE checkout_sessions
//   SET status = $newStatus, version = version + 1
//   WHERE id = $id AND version = $expectedVersion AND status IN ($allowedStatuses)
//
// If 0 rows updated → concurrent transition won — caller must handle
// (return idempotent result or reject with 409 Conflict).
//
// Terminal states (no outbound transitions):
//   succeeded, failed, expired, refunded_after_expiry, abandoned, payment_declined
//   (payment_declined is soft-terminal — buyer can retry, so the session can
//    be re-initiated; however it is terminal in the machine to prevent auto-
//    advancement. A new checkout session is created for retry.)
//
// @deprecated ADR-015 Sprint 1b: being replaced by ORDER_GROUP_MACHINE.
// Frontend cuts over in W5; table removal scheduled for W6. Do not add new
// callers — use order_groups.

export const CHECKOUT_SESSION_MACHINE: StateMachine<CheckoutStatus> = {
  created: ["payment_pending", "abandoned", "expired"],
  payment_pending: ["requires_action", "succeeded", "failed", "payment_declined", "expired", "abandoned"],
  requires_action: ["succeeded", "failed", "payment_declined", "expired"],
  // Terminal states — no outbound transitions defined
  // succeeded, failed, expired, refunded_after_expiry, abandoned, payment_declined
};

/**
 * State-precedence table for CHECKOUT_SESSION_MACHINE.
 *
 * Maps each incoming event to the set of statuses that must currently hold
 * for the transition to be permitted. Used to build the WHERE clause of the
 * CAS UPDATE.
 *
 * Notes:
 * - `abandoned` is allowed from `created` and `payment_pending` only.
 *   `requires_action` is NOT buyer-cancellable — Stripe owns the 3DS flow.
 * - `payment_declined` is treated as a soft decline — inventory is NOT
 *   released, allowing the buyer to retry with a different card.
 */
export const CHECKOUT_ALLOWED_FROM: Record<CheckoutStatus, readonly CheckoutStatus[]> = {
  payment_pending: ["created"],
  requires_action: ["payment_pending"],
  succeeded: ["payment_pending", "requires_action"],
  failed: ["payment_pending", "requires_action"],
  payment_declined: ["payment_pending", "requires_action"],
  expired: ["created", "payment_pending", "requires_action"],
  abandoned: ["created", "payment_pending"],
  // Terminal states — cannot be transitioned into from within this table
  // (refunded_after_expiry is set by system after expiry + refund webhook)
  refunded_after_expiry: ["expired"],
  created: [], // initial state, not a target transition
};

/**
 * Active checkout statuses — a partial unique index on checkout_sessions(cart_id)
 * filtered to these statuses ensures one active checkout per cart.
 */
export const CHECKOUT_ACTIVE_STATUSES: readonly CheckoutStatus[] = [
  "created",
  "payment_pending",
  "requires_action",
];

// ---------------------------------------------------------------------------
// Order Status Machine
// ---------------------------------------------------------------------------
//
// Phase 2A statuses: paid | shipped | delivered | completed | cancelled
// Phase 2B additions:
//   - delivery_assumed   — auto-complete path (14d tracked / 21d untracked)
//   - shipment_stale_review — 5d+ no tracking scan, pending SLA decision
//   - refund_in_progress — refund initiated (seller cancel or dispute)
//   - refunded           — refund completed
//
// Terminal states: completed, cancelled, refunded

export const ORDER_STATUS_MACHINE: StateMachine<OrderStatus> = {
  // "completed" direct from "paid" is the pickup path only (pickup-code-service.ts):
  // a pickup order has no carrier tracking to move through shipped/delivered,
  // and D3 (docs/BRIEF-shipping-performance.md §4) collapses the whole
  // handover + buyer-confirm sequence into one instant event — collection-code
  // redemption. Posted orders never take this edge; they still go through
  // shipped → delivered → completed.
  paid: ["shipped", "cancelled", "shipment_stale_review", "refund_in_progress", "refunded", "completed"],
  shipped: ["delivered", "delivery_assumed", "refund_in_progress"],
  delivered: ["completed", "refund_in_progress"],
  delivery_assumed: ["completed", "refund_in_progress"],
  shipment_stale_review: ["cancelled", "shipped"],
  refund_in_progress: ["refunded", "cancelled"],
  // completed, cancelled, refunded are terminal — no outbound transitions
};

// ---------------------------------------------------------------------------
// Payout Hold Status Machine
// ---------------------------------------------------------------------------
//
// Phase 2A statuses: held | releasing | released | refunded | blocked
// Phase 2B additions:
//   - release_failed_retryable — transfer failed, eligible for retry (< 3 attempts)
//   - release_failed_manual    — 3 failures, requires admin intervention
//
// Terminal states: released, refunded, release_failed_manual

export const PAYOUT_HOLD_MACHINE: StateMachine<PayoutHoldStatus> = {
  held: ["releasing", "refunded", "blocked", "release_failed_retryable"],
  // A release attempt can: succeed (released); be returned to `held` without
  // burning an attempt (platform balance_insufficient — re-evaluated next
  // cycle); fail retryably; or fail terminally (idempotency-key collision, or
  // the retry cap reached on the final attempt → release_failed_manual direct
  // from releasing).
  releasing: ["released", "held", "refunded", "blocked", "release_failed_retryable", "release_failed_manual"],
  release_failed_retryable: ["releasing", "release_failed_manual", "refunded", "blocked"],
  // released, refunded, blocked, release_failed_manual are terminal
};

// ---------------------------------------------------------------------------
// Order Group State Machine (ADR-015, Sprint 1b W1 scaffold)
// ---------------------------------------------------------------------------
//
// Replaces CHECKOUT_SESSION_MACHINE for the multi-vendor checkout flow.
// Paths:
//   Single-seller (destination charge): created → payment_pending
//     → (requires_action? → confirming?) → allocated (Stripe auto-transfers)
//   Multi-seller (SC&T): created → payment_pending → (requires_action? →
//     confirming?) → paid_unallocated → allocating → allocated
//
// Terminal states: allocated, payment_declined, expired, cancelled.

export const ORDER_GROUP_MACHINE: StateMachine<OrderGroupStatus> = {
  created: ["payment_pending", "expired", "cancelled"],
  payment_pending: [
    "requires_action",
    "confirming",
    "paid_unallocated",
    "allocated",
    "payment_declined",
    "expired",
    "cancelled",
  ],
  requires_action: [
    "confirming",
    "paid_unallocated",
    "allocated",
    "payment_declined",
    "expired",
  ],
  // LB-F10 grace window — expired only allowed after worker hits grace cap.
  confirming: ["paid_unallocated", "allocated", "payment_declined", "expired"],
  paid_unallocated: ["allocating"],
  allocating: ["allocated", "partially_failed"],
  // Admin retry — partially_failed back to allocating or directly to allocated.
  partially_failed: ["allocating", "allocated"],
  // allocated, payment_declined, expired, cancelled are terminal
};

/**
 * State-precedence table for ORDER_GROUP_MACHINE.
 *
 * Maps each target status to the set of current statuses that must hold for
 * the CAS UPDATE to accept the transition.
 */
export const ORDER_GROUP_ALLOWED_FROM: Record<OrderGroupStatus, readonly OrderGroupStatus[]> = {
  created: [], // initial state, never transitioned into
  payment_pending: ["created"],
  requires_action: ["payment_pending"],
  confirming: ["payment_pending", "requires_action"],
  paid_unallocated: ["payment_pending", "requires_action", "confirming"],
  allocating: ["paid_unallocated", "partially_failed"],
  allocated: [
    "payment_pending",
    "requires_action",
    "confirming",
    "allocating",
    "partially_failed",
  ],
  partially_failed: ["allocating"],
  expired: ["created", "payment_pending", "requires_action", "confirming"],
  payment_declined: ["payment_pending", "requires_action", "confirming"],
  cancelled: ["created", "payment_pending"],
};

/**
 * Active order_group statuses — a partial unique index on order_groups(cart_id)
 * filtered to these statuses ensures at most one active group per cart.
 */
export const ORDER_GROUP_ACTIVE_STATUSES: readonly OrderGroupStatus[] = [
  "created",
  "payment_pending",
  "requires_action",
  "confirming",
];

// ---------------------------------------------------------------------------
// Seller Allocation State Machine (ADR-015, Sprint 1b W1 scaffold)
// ---------------------------------------------------------------------------
//
// One allocation per (order_group, seller). Paths:
//   Single-seller destination charge: pending → charge_reserved → transferred
//     (Stripe auto-transfers; no explicit transfer call)
//   Multi-seller SC&T: pending → charge_reserved → transfer_pending
//     → (transfer_retrying)* → transferred
//   Post-ship: transferred → shipped → delivered → (refunded?)
//
// Note on `released`: ADR-015 uses the word but release timing is owned by
// the existing payout_holds table; we fold it into `transferred` here and
// revisit if W2 surfaces a divergence.
//
// Terminal states: transfer_blocked, refunded, cancelled, delivered.

export const SELLER_ALLOCATION_MACHINE: StateMachine<SellerAllocationStatus> = {
  pending: ["charge_reserved", "cancelled"],
  // Direct charge_reserved → transferred allowed for destination-charge single-seller.
  charge_reserved: ["transfer_pending", "transferred", "cancelled"],
  transfer_pending: ["transferred", "transfer_retrying", "transfer_blocked"],
  transfer_retrying: ["transferred", "transfer_blocked"],
  transferred: ["shipped", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  // transfer_blocked, refunded, cancelled are terminal
};

export const SELLER_ALLOCATION_ALLOWED_FROM: Record<SellerAllocationStatus, readonly SellerAllocationStatus[]> = {
  pending: [],
  charge_reserved: ["pending"],
  transfer_pending: ["charge_reserved"],
  transfer_retrying: ["transfer_pending"],
  transferred: ["charge_reserved", "transfer_pending", "transfer_retrying"],
  transfer_blocked: ["transfer_pending", "transfer_retrying"],
  shipped: ["transferred"],
  delivered: ["shipped"],
  refunded: ["transferred", "shipped", "delivered"],
  cancelled: ["pending", "charge_reserved"],
};
