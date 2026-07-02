import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const MoneySchema = z.object({
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3).default("AUD"),
});

export const MoneySnapshotSchema = z.object({
  subtotalCents: z.number().int().nonnegative(),
  shippingCents: z.number().int().nonnegative(),
  platformFeeCents: z.number().int().nonnegative(),
  sellerProceedsCents: z.number().int().nonnegative(),
  totalCents: z.number().int().positive(),
  currency: z.string().length(3).default("AUD"),
});

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export const CartItemSchema = z.object({
  id: z.string(),
  cartId: z.string(),
  channelListingId: z.string(),
  priceCents: z.number().int().positive(),
  currency: z.string().length(3),
  createdAt: z.date(),
});

export const CartSchema = z.object({
  id: z.string(),
  buyerId: z.string(),
  channelId: z.string(),
  items: z.array(CartItemSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const AddToCartInputSchema = z.object({
  listingId: z.string().min(1),
});

export type CartItem = z.infer<typeof CartItemSchema>;
export type Cart = z.infer<typeof CartSchema>;
export type AddToCartInput = z.infer<typeof AddToCartInputSchema>;

// ---------------------------------------------------------------------------
// Checkout Session
// ---------------------------------------------------------------------------

export const CheckoutStatusSchema = z.enum([
  "created",
  "payment_pending",
  "requires_action",
  "payment_declined",
  "succeeded",
  "failed",
  "expired",
  "refunded_after_expiry",
  "abandoned",
]);

export type CheckoutStatus = z.infer<typeof CheckoutStatusSchema>;

export const CheckoutSessionSchema = z.object({
  id: z.string(),
  cartId: z.string(),
  buyerId: z.string(),
  channelId: z.string(),
  status: CheckoutStatusSchema,
  version: z.number().int().positive(),
  subtotalCents: z.number().int().nonnegative(),
  shippingCents: z.number().int().nonnegative(),
  platformFeeCents: z.number().int().nonnegative(),
  sellerProceedsCents: z.number().int().nonnegative(),
  totalCents: z.number().int().positive(),
  currency: z.string().length(3),
  stripePaymentIntentId: z.string().nullable(),
  stripeClientSecret: z.string().nullable(),
  shippingAddressId: z.string().nullable(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const InitiateCheckoutInputSchema = z.object({
  shippingAddressId: z.string().min(1),
});

export type CheckoutSession = z.infer<typeof CheckoutSessionSchema>;
export type InitiateCheckoutInput = z.infer<typeof InitiateCheckoutInputSchema>;

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

export const OrderStatusSchema = z.enum([
  "paid",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
  // Phase 2B additions
  "delivery_assumed",
  "shipment_stale_review",
  "refund_in_progress",
  "refunded",
]);

export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const AddressSnapshotSchema = z.object({
  line1: z.string(),
  line2: z.string().optional(),
  suburb: z.string(),
  state: z.string(),
  postcode: z.string(),
  country: z.string().length(2),
});

export const OrderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  channelListingId: z.string(),
  priceCents: z.number().int().positive(),
  currency: z.string().length(3),
  createdAt: z.date(),
});

export const OrderSchema = z.object({
  id: z.string(),
  checkoutSessionId: z.string(),
  buyerId: z.string(),
  sellerId: z.string(),
  channelId: z.string(),
  status: OrderStatusSchema,
  subtotalCents: z.number().int().nonnegative(),
  shippingCents: z.number().int().nonnegative(),
  platformFeeCents: z.number().int().nonnegative(),
  sellerProceedsCents: z.number().int().nonnegative(),
  totalCents: z.number().int().positive(),
  currency: z.string().length(3),
  shippingAddressSnapshot: AddressSnapshotSchema.nullable(),
  senderAddressSnapshot: AddressSnapshotSchema.nullable(),
  trackingNumber: z.string().nullable(),
  trackingCarrier: z.string().nullable(),
  // Phase 2B additions
  shippingLabelId: z.string().nullable(),
  lastTrackingStatus: z.string().nullable(),
  lastTrackingEventAt: z.date().nullable(),
  deliveryConfirmedAt: z.date().nullable(),
  slaDeadlineAt: z.date().nullable(),
  isInternational: z.boolean().nullable(),
  jobsEnqueuedAt: z.date().nullable(),
  stripePaymentIntentId: z.string().nullable(),
  stripeTransferId: z.string().nullable(),
  items: z.array(OrderItemSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type AddressSnapshot = z.infer<typeof AddressSnapshotSchema>;

// ---------------------------------------------------------------------------
// Payout Hold
// ---------------------------------------------------------------------------

export const PayoutHoldStatusSchema = z.enum([
  "held",
  "releasing",
  "released",
  "refunded",
  "blocked",
  // Phase 2B additions
  "release_failed_retryable",
  "release_failed_manual",
]);

export type PayoutHoldStatus = z.infer<typeof PayoutHoldStatusSchema>;

export const PayoutHoldSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  sellerStripeAccountId: z.string(),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3),
  transferId: z.string().nullable(),
  version: z.number().int().positive(),
  status: PayoutHoldStatusSchema,
  // Phase 2B additions
  frozenAt: z.date().nullable(),
  nextRetryAt: z.date().nullable(),
  failureReason: z.string().nullable(),
  releaseAttempts: z.number().int().nonnegative(),
  // Monotonic count of balance_insufficient re-queues; never burns the manual
  // cap and never decrements the idempotency-key sequence (HIGH 1).
  fundingDeferrals: z.number().int().nonnegative(),
  buyerConfirmedAt: z.date().nullable(),
  holdPolicyApplied: z.string().nullable(),
  deliveryConfirmedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PayoutHold = z.infer<typeof PayoutHoldSchema>;

// ---------------------------------------------------------------------------
// Refund (Phase 2B)
// ---------------------------------------------------------------------------

export const RefundStatusSchema = z.enum([
  "pending",
  "pending_reversal",
  "processed",
  "failed",
]);

export type RefundStatus = z.infer<typeof RefundStatusSchema>;

export const RefundSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  initiatedBy: z.string().nullable(),
  type: z.string(),
  amountCents: z.number().int().positive(),
  platformFeeRefundedCents: z.number().int().nonnegative().nullable(),
  reason: z.string().nullable(),
  stripeRefundId: z.string().nullable(),
  status: RefundStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Refund = z.infer<typeof RefundSchema>;

// ---------------------------------------------------------------------------
// Payment Operation (Phase 2B)
// ---------------------------------------------------------------------------

export const PaymentOperationTypeSchema = z.enum([
  "charge",
  "refund",
  "transfer",
  "reversal",
  "dispute_hold",
  "dispute_release",
]);

export type PaymentOperationType = z.infer<typeof PaymentOperationTypeSchema>;

export const PaymentOperationStatusSchema = z.enum([
  "pending",
  "succeeded",
  "failed",
  // LB-3 (R1): Stripe returned a 5xx / network error after the request was
  // accepted. The Stripe side-effect is indeterminate and MUST NOT be
  // retried with the same idempotency key (Stripe caches the 5xx for 24h).
  // Reconciled out-of-band via webhook handlers or the daily reconciliation
  // job, never via `resumePendingRefunds`.
  "indeterminate_5xx",
]);

export type PaymentOperationStatus = z.infer<typeof PaymentOperationStatusSchema>;

export const PaymentOperationSchema = z.object({
  id: z.string(),
  orderId: z.string().nullable(),
  orderGroupId: z.string().nullable(),
  type: PaymentOperationTypeSchema,
  provider: z.string(),
  providerObjectId: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  status: PaymentOperationStatusSchema,
  lastError: z.string().nullable(),
  amountCents: z.number().int().nonnegative().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PaymentOperation = z.infer<typeof PaymentOperationSchema>;

// ---------------------------------------------------------------------------
// Multi-Vendor Order Groups (ADR-015, Sprint 1b W1 scaffold)
// ---------------------------------------------------------------------------
//
// order_groups replace checkout_sessions as the primary payment anchor once the
// frontend switches in W5. A group holds one checkout regardless of seller
// count; per-seller slicing lives in SellerAllocation.
//
// charge_type:
//   destination - single-seller: Stripe destination charge auto-transfers funds.
//   sct         - multi-seller: Separate Charges & Transfers, fan-out workers
//                 issue per-seller transfers post-payment.

export const ChargeTypeSchema = z.enum(["destination", "sct"]);
export type ChargeType = z.infer<typeof ChargeTypeSchema>;

export const OrderGroupStatusSchema = z.enum([
  "created",
  "payment_pending",
  "requires_action",
  "confirming",          // LB-F10 grace window between Stripe confirm and webhook
  "paid_unallocated",    // SC&T only: PI succeeded, transfers not yet fanned out
  "allocating",
  "allocated",
  "partially_failed",
  "expired",
  "payment_declined",
  "cancelled",
]);

export type OrderGroupStatus = z.infer<typeof OrderGroupStatusSchema>;

export const SellerAllocationStatusSchema = z.enum([
  "pending",
  "charge_reserved",
  "transfer_pending",
  "transfer_retrying",
  "transferred",
  "transfer_blocked",
  "shipped",
  "delivered",
  "refunded",
  "cancelled",
]);

export type SellerAllocationStatus = z.infer<typeof SellerAllocationStatusSchema>;

export const AllocationRefundStatusSchema = z.enum([
  "pending",
  "pending_reversal",
  "processed",
  "failed",
]);

export type AllocationRefundStatus = z.infer<typeof AllocationRefundStatusSchema>;

// ---------------------------------------------------------------------------
// Buyer-facing display status (Phase 2B)
// ---------------------------------------------------------------------------

/**
 * Maps internal order statuses to buyer-friendly display labels.
 * Used in API responses to avoid exposing internal state machine labels.
 */
export const BuyerDisplayStatusSchema = z.enum([
  "payment_received",    // paid
  "being_prepared",      // paid (between enqueue and ship)
  "on_its_way",          // shipped
  "delivered",           // delivered | delivery_assumed
  "completed",           // completed
  "cancelled",           // cancelled
  "refund_processing",   // refund_in_progress
  "refunded",            // refunded
]);

export type BuyerDisplayStatus = z.infer<typeof BuyerDisplayStatusSchema>;

/**
 * Maps an internal OrderStatus to a BuyerDisplayStatus.
 */
export function toBuyerDisplayStatus(status: OrderStatus): BuyerDisplayStatus {
  switch (status) {
    case "paid":
      return "payment_received";
    case "shipped":
      return "on_its_way";
    case "delivered":
    case "delivery_assumed":
      return "delivered";
    case "completed":
      return "completed";
    case "cancelled":
    case "shipment_stale_review":
      return "cancelled";
    case "refund_in_progress":
      return "refund_processing";
    case "refunded":
      return "refunded";
  }
}

// ---------------------------------------------------------------------------
// Checkout Groups — ADR-015 Sprint 1b W2 (Quote + PaymentIntent)
// ---------------------------------------------------------------------------

/**
 * Per-seller allocation summary returned in quote and status responses.
 */
export const AllocationSummarySchema = z.object({
  allocationId: z.string(),
  sellerId: z.string(),
  status: SellerAllocationStatusSchema,
  subtotalCents: z.number().int().nonnegative(),
  shippingCents: z.number().int().nonnegative(),
  platformFeeCents: z.number().int().nonnegative(),
  sellerProceedsCents: z.number().int().nonnegative(),
  totalCents: z.number().int().positive(),
  itemIds: z.array(z.string()),
});

export type AllocationSummary = z.infer<typeof AllocationSummarySchema>;

/**
 * Group-level totals returned in quote response.
 */
export const CheckoutGroupTotalsSchema = z.object({
  subtotalCents: z.number().int().nonnegative(),
  shippingCents: z.number().int().nonnegative(),
  platformFeeCents: z.number().int().nonnegative(),
  sellerProceedsCents: z.number().int().nonnegative(),
  totalCents: z.number().int().positive(),
  currency: z.string().length(3),
});

export type CheckoutGroupTotals = z.infer<typeof CheckoutGroupTotalsSchema>;

/**
 * Request body for POST /api/v1/store/checkout-groups.
 */
export const CheckoutGroupQuoteRequestSchema = z.object({
  shippingAddressId: z.string().min(1, "shippingAddressId is required"),
});

export type CheckoutGroupQuoteRequest = z.infer<typeof CheckoutGroupQuoteRequestSchema>;

/**
 * Response for POST /api/v1/store/checkout-groups (quote + PaymentIntent creation).
 */
export const CheckoutGroupQuoteResponseSchema = z.object({
  orderGroupId: z.string(),
  clientSecret: z.string(),
  chargeType: ChargeTypeSchema,
  totals: CheckoutGroupTotalsSchema,
  allocations: z.array(AllocationSummarySchema),
  expiresAt: z.date().nullable(),
});

export type CheckoutGroupQuoteResponse = z.infer<typeof CheckoutGroupQuoteResponseSchema>;

/**
 * Response for GET /api/v1/store/checkout-groups/:id (status polling).
 */
export const CheckoutGroupStatusResponseSchema = z.object({
  orderGroupId: z.string(),
  status: OrderGroupStatusSchema,
  chargeType: ChargeTypeSchema,
  totals: CheckoutGroupTotalsSchema,
  allocations: z.array(AllocationSummarySchema),
  expiresAt: z.date().nullable(),
});

export type CheckoutGroupStatusResponse = z.infer<typeof CheckoutGroupStatusResponseSchema>;
