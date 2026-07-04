import { pgTable, varchar, integer, boolean, timestamp, unique, index, jsonb, check, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { user } from "./auth";
import { channelListings } from "./listings";
import { addresses, sellerProfiles } from "./user-domain";
import { channels } from "./channels";

// ---------------------------------------------------------------------------
// Carts
// ---------------------------------------------------------------------------

export const carts = pgTable("carts", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  buyerId: varchar("buyer_id", { length: 26 }).notNull().references(() => user.id, { onDelete: "cascade" }),
  channelId: varchar("channel_id", { length: 26 }).notNull().references(() => channels.id),
  // ADR-015 Sprint 1b W1: cart is now multi-seller. The `seller_id` column was
  // dropped here — per-item sellers derive from channel_listings.inventory_items.owner_id.
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  // One active cart per buyer per channel
  unique("carts_buyer_channel_unique").on(table.buyerId, table.channelId),
  index("carts_buyer_id_idx").on(table.buyerId),
]);

// ---------------------------------------------------------------------------
// Cart Items
// ---------------------------------------------------------------------------

export const cartItems = pgTable("cart_items", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  cartId: varchar("cart_id", { length: 26 }).notNull().references(() => carts.id, { onDelete: "cascade" }),
  channelListingId: varchar("channel_listing_id", { length: 26 }).notNull().references(() => channelListings.id),
  // Price snapshot at time of add — prevents price drift during checkout
  priceCents: integer("price_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // No duplicate items in a cart (secondhand = qty 1)
  unique("cart_items_cart_listing_unique").on(table.cartId, table.channelListingId),
  index("cart_items_cart_id_idx").on(table.cartId),
  check("cart_items_price_positive", sql`${table.priceCents} > 0`),
]);

// ---------------------------------------------------------------------------
// Checkout Sessions
// ---------------------------------------------------------------------------

export const checkoutSessions = pgTable("checkout_sessions", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  cartId: varchar("cart_id", { length: 26 }).notNull().references(() => carts.id),
  buyerId: varchar("buyer_id", { length: 26 }).notNull().references(() => user.id),
  channelId: varchar("channel_id", { length: 26 }).notNull().references(() => channels.id),
  status: varchar("status", { length: 30 }).notNull().default("created"),
  // Optimistic concurrency control — incremented on every status transition
  version: integer("version").notNull().default(1),
  // Money snapshot — locked at session creation, copied to order
  subtotalCents: integer("subtotal_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull(),
  platformFeeCents: integer("platform_fee_cents").notNull(),
  // Fee Model D (04/07/2026, task 8ecbbbcf) — buyer-side fee, 0 on pure-pickup
  // orders. Never deducted from sellerProceedsCents.
  buyerProtectionFeeCents: integer("buyer_protection_fee_cents").notNull().default(0),
  sellerProceedsCents: integer("seller_proceeds_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
  // Stripe payment intent
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  stripeClientSecret: varchar("stripe_client_secret", { length: 500 }),
  // Shipping address chosen by buyer
  shippingAddressId: varchar("shipping_address_id", { length: 26 }).references(() => addresses.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  index("checkout_sessions_cart_id_idx").on(table.cartId),
  index("checkout_sessions_buyer_id_idx").on(table.buyerId),
  index("checkout_sessions_status_idx").on(table.status),
  index("checkout_sessions_stripe_pi_idx").on(table.stripePaymentIntentId),
  check("checkout_sessions_total_positive", sql`${table.totalCents} > 0`),
]);

// NOTE: A partial unique index on checkout_sessions(cart_id) for active statuses
// (created, payment_pending, requires_action) must be created via raw SQL in the migration:
//
//   CREATE UNIQUE INDEX IF NOT EXISTS checkout_sessions_cart_active_unique
//   ON checkout_sessions(cart_id)
//   WHERE status IN ('created', 'payment_pending', 'requires_action');
//
// Drizzle 0.45.x does not support filtered (partial) unique indexes natively.
// Add this to the migration file after running pnpm db:generate.

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const orders = pgTable("orders", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  checkoutSessionId: varchar("checkout_session_id", { length: 26 }).notNull().references(() => checkoutSessions.id),
  buyerId: varchar("buyer_id", { length: 26 }).notNull().references(() => user.id),
  sellerId: varchar("seller_id", { length: 26 }).notNull().references(() => user.id),
  channelId: varchar("channel_id", { length: 26 }).notNull().references(() => channels.id),
  status: varchar("status", { length: 30 }).notNull().default("paid"),
  // Money snapshot — copied from checkout_session on order creation
  subtotalCents: integer("subtotal_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull(),
  platformFeeCents: integer("platform_fee_cents").notNull(),
  // Fee Model D (04/07/2026, task 8ecbbbcf) — buyer-side fee, 0 on pure-pickup
  // orders. Never deducted from sellerProceedsCents.
  buyerProtectionFeeCents: integer("buyer_protection_fee_cents").notNull().default(0),
  sellerProceedsCents: integer("seller_proceeds_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
  // Address snapshots (immutable at order creation)
  shippingAddressSnapshot: jsonb("shipping_address_snapshot"),
  senderAddressSnapshot: jsonb("sender_address_snapshot"),
  // Tracking
  trackingNumber: varchar("tracking_number", { length: 255 }),
  trackingCarrier: varchar("tracking_carrier", { length: 100 }),
  // Phase 2B: extended tracking + SLA columns
  shippingLabelId: varchar("shipping_label_id", { length: 255 }),
  lastTrackingStatus: varchar("last_tracking_status", { length: 100 }),
  lastTrackingEventAt: timestamp("last_tracking_event_at", { withTimezone: true }),
  deliveryConfirmedAt: timestamp("delivery_confirmed_at", { withTimezone: true }),
  slaDeadlineAt: timestamp("sla_deadline_at", { withTimezone: true }),
  isInternational: boolean("is_international").default(false),
  // Idempotency guard for downstream job enqueue on webhook retry
  jobsEnqueuedAt: timestamp("jobs_enqueued_at", { withTimezone: true }),
  // Stripe references
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  stripeTransferId: varchar("stripe_transfer_id", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  index("orders_buyer_id_idx").on(table.buyerId),
  index("orders_seller_id_idx").on(table.sellerId),
  index("orders_status_idx").on(table.status),
  index("orders_channel_id_idx").on(table.channelId),
  // Unique: one order per checkout session (prevents duplicate order creation on retry)
  unique("orders_checkout_session_id_unique").on(table.checkoutSessionId),
  // Phase 2B: worker query index (SLA enforcement + auto-complete)
  index("orders_status_created_at_idx").on(table.status, table.createdAt),
  check("orders_total_positive", sql`${table.totalCents} > 0`),
]);

// ---------------------------------------------------------------------------
// Order Items
// ---------------------------------------------------------------------------

export const orderItems = pgTable("order_items", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  orderId: varchar("order_id", { length: 26 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  channelListingId: varchar("channel_listing_id", { length: 26 }).notNull().references(() => channelListings.id),
  // Price snapshot at time of purchase
  priceCents: integer("price_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("order_items_order_id_idx").on(table.orderId),
  unique("order_items_order_listing_unique").on(table.orderId, table.channelListingId),
]);

// ---------------------------------------------------------------------------
// Payout Holds
// ---------------------------------------------------------------------------

export const payoutHolds = pgTable("payout_holds", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  orderId: varchar("order_id", { length: 26 }).notNull().references(() => orders.id),
  sellerStripeAccountId: varchar("seller_stripe_account_id", { length: 255 }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
  // Stripe transfer ID — set when payout is released
  transferId: varchar("transfer_id", { length: 255 }),
  // Optimistic lock for concurrent release attempts
  version: integer("version").notNull().default(1),
  status: varchar("status", { length: 30 }).notNull().default("held"),
  // held | releasing | released | refunded | blocked | release_failed_retryable | release_failed_manual
  // Phase 2B: freeze + retry + policy tracking columns
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  failureReason: varchar("failure_reason", { length: 500 }),
  // Per-attempt counter for the payout-release worker. Drives the per-attempt
  // idempotency key (`${holdId}:${attempt}`) and the give-up-after-3 cap.
  releaseAttempts: integer("release_attempts").notNull().default(0),
  // Monotonic count of platform-funding deferrals (balance_insufficient
  // re-queues). Tracked separately from `releaseAttempts` so a funding deferral
  // never decrements the attempt/idempotency-key sequence (which would poison
  // the per-attempt Stripe idempotency key) and never burns the manual cap.
  fundingDeferrals: integer("funding_deferrals").notNull().default(0),
  buyerConfirmedAt: timestamp("buyer_confirmed_at", { withTimezone: true }),
  holdPolicyApplied: varchar("hold_policy_applied", { length: 100 }),
  deliveryConfirmedAt: timestamp("delivery_confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  // Unique: one payout hold per order (prevents double-release money flows)
  unique("payout_holds_order_id_unique").on(table.orderId),
  index("payout_holds_status_idx").on(table.status),
  index("payout_holds_seller_account_idx").on(table.sellerStripeAccountId),
  // Phase 2B: payout release eligibility query index
  index("payout_holds_release_eligibility_idx").on(
    table.status,
    table.frozenAt,
    table.deliveryConfirmedAt,
    table.buyerConfirmedAt,
  ),
  // Phase 2B: retry sweep index
  index("payout_holds_retry_idx").on(table.status, table.nextRetryAt),
  check("payout_holds_amount_positive", sql`${table.amountCents} > 0`),
]);

// ---------------------------------------------------------------------------
// Refunds (Phase 2B)
// ---------------------------------------------------------------------------

export const refunds = pgTable("refunds", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  orderId: varchar("order_id", { length: 26 }).notNull().references(() => orders.id),
  initiatedBy: varchar("initiated_by", { length: 26 }).references(() => user.id, { onDelete: "set null" }),
  // Type — 'full' is the only supported type in Phase 2B
  type: varchar("type", { length: 20 }).notNull().default("full"),
  amountCents: integer("amount_cents").notNull(),
  platformFeeRefundedCents: integer("platform_fee_refunded_cents"),
  reason: varchar("reason", { length: 500 }),
  stripeRefundId: varchar("stripe_refund_id", { length: 255 }),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  // pending | pending_reversal | processed | failed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  index("refunds_order_id_idx").on(table.orderId),
  index("refunds_status_idx").on(table.status),
  // NOTE: A partial unique index ensures at most one active refund per order.
  // Must be added as raw SQL in the migration (Drizzle 0.45.x lacks partial unique index support):
  //
  //   CREATE UNIQUE INDEX IF NOT EXISTS refunds_order_active_unique
  //   ON refunds(order_id)
  //   WHERE status IN ('pending', 'pending_reversal', 'processed');
]);

// ---------------------------------------------------------------------------
// Order Groups (ADR-015, Sprint 1b W1) — multi-vendor checkout anchor
// ---------------------------------------------------------------------------
//
// order_groups replace checkout_sessions as the primary payment anchor once
// the frontend switches in W5. A group holds one checkout regardless of seller
// count; per-seller slicing lives in order_group_seller_allocations.
//
// Hand-SQL in migration (Drizzle 0.45.x lacks partial unique index support):
//
//   CREATE UNIQUE INDEX IF NOT EXISTS order_groups_cart_active_unique
//   ON order_groups(cart_id)
//   WHERE status IN ('created', 'payment_pending', 'requires_action', 'confirming');

export const orderGroups = pgTable("order_groups", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  buyerId: varchar("buyer_id", { length: 26 }).notNull().references(() => user.id),
  channelId: varchar("channel_id", { length: 26 }).notNull().references(() => channels.id),
  // No cascade — the group must outlive the cart so post-checkout cart cleanup
  // does not destroy the group audit trail. Any code path that hard-deletes a cart
  // must first detach any active group (set cart_id to a tombstone or, in W2+,
  // relax this to ON DELETE SET NULL with the column made nullable).
  cartId: varchar("cart_id", { length: 26 }).notNull().references(() => carts.id),
  status: varchar("status", { length: 30 }).notNull().default("created"),
  // Optimistic concurrency control — incremented on every status transition
  version: integer("version").notNull().default(1),
  // destination | sct  (single-seller vs multi-seller Stripe strategy)
  chargeType: varchar("charge_type", { length: 20 }).notNull(),
  // sha256 of sorted allocations + amounts — LB-M1 conservation anchor
  quoteHash: varchar("quote_hash", { length: 64 }).notNull(),
  // Money snapshot — locked at group creation
  subtotalCents: integer("subtotal_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull(),
  platformFeeCents: integer("platform_fee_cents").notNull(),
  sellerProceedsCents: integer("seller_proceeds_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
  // Stripe PaymentIntent
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  stripeClientSecret: varchar("stripe_client_secret", { length: 500 }),
  // SC&T only — groups transfers under one Stripe transfer_group
  stripeTransferGroup: varchar("stripe_transfer_group", { length: 255 }),
  // Shipping address snapshot — captured at group creation
  shippingAddressId: varchar("shipping_address_id", { length: 26 }).references(() => addresses.id, { onDelete: "set null" }),
  shippingAddressSnapshot: jsonb("shipping_address_snapshot"),
  // LB-F8-WAL — set true when a payment operation lands in indeterminate_5xx
  hasPendingReconciliation: boolean("has_pending_reconciliation").notNull().default(false),
  reconciliationLockedUntil: timestamp("reconciliation_locked_until", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  index("order_groups_buyer_id_idx").on(table.buyerId),
  index("order_groups_cart_id_idx").on(table.cartId),
  index("order_groups_status_idx").on(table.status),
  index("order_groups_stripe_pi_idx").on(table.stripePaymentIntentId),
  // Expiry worker query path. TODO ADR-015-W3: the dedicated order_group expiry
  // worker (LB-F10) will likely filter on (status, expires_at) to match the
  // existing checkout-expiry pattern. If so, add index (status, expires_at) then
  // and drop or keep this one based on other query needs (eg. created_at pagination).
  index("order_groups_status_created_at_idx").on(table.status, table.createdAt),
  check("order_groups_total_positive", sql`${table.totalCents} > 0`),
  check("order_groups_charge_type_enum", sql`${table.chargeType} IN ('destination','sct')`),
  check("order_groups_currency_aud", sql`${table.currency} = 'AUD'`),
]);

// ---------------------------------------------------------------------------
// Order Group Seller Allocations — per-seller slice within a group
// ---------------------------------------------------------------------------
//
// Hand-SQL in migration:
//
//   CREATE UNIQUE INDEX IF NOT EXISTS allocation_transfer_idem_unique
//   ON order_group_seller_allocations(stripe_transfer_idempotency_key)
//   WHERE stripe_transfer_idempotency_key IS NOT NULL;

export const orderGroupSellerAllocations = pgTable("order_group_seller_allocations", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  orderGroupId: varchar("order_group_id", { length: 26 }).notNull().references(() => orderGroups.id, { onDelete: "cascade" }),
  sellerId: varchar("seller_id", { length: 26 }).notNull().references(() => user.id),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  version: integer("version").notNull().default(1),
  // Money snapshot — per-seller subtotals computed at quote time
  subtotalCents: integer("subtotal_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull(),
  platformFeeCents: integer("platform_fee_cents").notNull(),
  sellerProceedsCents: integer("seller_proceeds_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
  // SC&T transfer tracking
  stripeTransferId: varchar("stripe_transfer_id", { length: 255 }),
  // Format: "${orderGroupId}:${allocationId}" — LB-M2 idempotency (W3)
  stripeTransferIdempotencyKey: varchar("stripe_transfer_idempotency_key", { length: 255 }),
  // W4: set when per-allocation order row is created post-transfer
  orderId: varchar("order_id", { length: 26 }).references(() => orders.id, { onDelete: "set null" }),
  transferAttempts: integer("transfer_attempts").notNull().default(0),
  lastTransferError: varchar("last_transfer_error", { length: 1000 }),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  // One allocation per (group, seller)
  unique("allocations_group_seller_unique").on(table.orderGroupId, table.sellerId),
  // Supports composite FK from child tables that carry a denormalised order_group_id
  // (order_group_allocation_items, allocation_refunds) — enforces that a child row's
  // order_group_id matches its allocation's order_group_id at the DB level.
  unique("allocations_id_group_unique").on(table.id, table.orderGroupId),
  index("allocations_order_group_id_idx").on(table.orderGroupId),
  index("allocations_seller_id_idx").on(table.sellerId),
  index("allocations_status_idx").on(table.status),
  index("allocations_stripe_transfer_id_idx").on(table.stripeTransferId),
  check("allocations_total_positive", sql`${table.totalCents} > 0`),
]);

// ---------------------------------------------------------------------------
// Order Group Allocation Items — line items scoped to an allocation
// ---------------------------------------------------------------------------

export const orderGroupAllocationItems = pgTable("order_group_allocation_items", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  // NOTE: allocation_id + order_group_id are enforced via a composite FK in the
  // table config below to guarantee the denormalised order_group_id matches the
  // allocation's parent group (prevents silent data corruption from bad inserts).
  allocationId: varchar("allocation_id", { length: 26 }).notNull(),
  // Denormalised for cheap group-wide queries (mirrors order_items → orders pattern)
  orderGroupId: varchar("order_group_id", { length: 26 }).notNull(),
  channelListingId: varchar("channel_listing_id", { length: 26 }).notNull().references(() => channelListings.id),
  priceCents: integer("price_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Composite FK to order_group_seller_allocations(id, order_group_id).
  // References the allocations_id_group_unique index on the parent.
  foreignKey({
    name: "allocation_items_allocation_group_fk",
    columns: [table.allocationId, table.orderGroupId],
    foreignColumns: [orderGroupSellerAllocations.id, orderGroupSellerAllocations.orderGroupId],
  }).onDelete("cascade"),
  index("allocation_items_allocation_id_idx").on(table.allocationId),
  index("allocation_items_order_group_id_idx").on(table.orderGroupId),
  unique("allocation_items_allocation_listing_unique").on(table.allocationId, table.channelListingId),
  check("allocation_items_price_positive", sql`${table.priceCents} > 0`),
]);

// ---------------------------------------------------------------------------
// Allocation Refunds — seller-scoped refunds parallel to refunds table
// ---------------------------------------------------------------------------
//
// Hand-SQL in migration (Drizzle 0.45.x lacks partial unique index support):
//
//   Item-scoped refunds — at most one active refund per item:
//   CREATE UNIQUE INDEX IF NOT EXISTS allocation_refunds_item_active_unique
//   ON allocation_refunds(allocation_item_id)
//   WHERE allocation_item_id IS NOT NULL
//     AND status IN ('pending', 'pending_reversal', 'processed');
//
//   Allocation-scoped refunds (whole-seller) — at most one active full refund:
//   CREATE UNIQUE INDEX IF NOT EXISTS allocation_refunds_allocation_full_active_unique
//   ON allocation_refunds(allocation_id)
//   WHERE allocation_item_id IS NULL
//     AND status IN ('pending', 'pending_reversal', 'processed');
//
// These replace the single allocation_refunds_allocation_active_unique index (from 0018)
// which incorrectly blocked a second item refund once any refund on the allocation
// reached 'processed'. W4 refund service is responsible for preventing mixed
// full/item refund state (app-layer invariant).

export const allocationRefunds = pgTable("allocation_refunds", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  // NOTE: allocation_id + order_group_id are enforced via a composite FK below.
  allocationId: varchar("allocation_id", { length: 26 }).notNull(),
  // Denormalised for group-wide refund queries
  orderGroupId: varchar("order_group_id", { length: 26 }).notNull(),
  // NULL = whole-allocation refund. NOT NULL = per-item refund (ADR-015 SC&T refund
  // granularity). W4 refund service writes this; SET NULL on item soft-delete so the
  // audit trail survives.
  allocationItemId: varchar("allocation_item_id", { length: 26 }).references(() => orderGroupAllocationItems.id, { onDelete: "set null" }),
  initiatedBy: varchar("initiated_by", { length: 26 }).references(() => user.id, { onDelete: "set null" }),
  type: varchar("type", { length: 20 }).notNull().default("full"),
  amountCents: integer("amount_cents").notNull(),
  platformFeeRefundedCents: integer("platform_fee_refunded_cents"),
  reason: varchar("reason", { length: 500 }),
  stripeRefundId: varchar("stripe_refund_id", { length: 255 }),
  // SC&T reversal — populated by W4 refund service (LB-F7 conjunctive flags)
  stripeTransferReversalId: varchar("stripe_transfer_reversal_id", { length: 255 }),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  // pending | pending_reversal | processed | failed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  // Composite FK — see rationale on order_group_allocation_items above.
  // Deliberately NOT cascading: refund audit rows survive any future hard-delete
  // of the allocation (soft-delete is the preferred path per Working Rule #4).
  foreignKey({
    name: "allocation_refunds_allocation_group_fk",
    columns: [table.allocationId, table.orderGroupId],
    foreignColumns: [orderGroupSellerAllocations.id, orderGroupSellerAllocations.orderGroupId],
  }),
  index("allocation_refunds_allocation_id_idx").on(table.allocationId),
  index("allocation_refunds_order_group_id_idx").on(table.orderGroupId),
  index("allocation_refunds_allocation_item_id_idx").on(table.allocationItemId),
  index("allocation_refunds_status_idx").on(table.status),
  check("allocation_refunds_amount_positive", sql`${table.amountCents} > 0`),
]);

// ---------------------------------------------------------------------------
// Payment Operations (Phase 2B) — write-ahead log for all Stripe calls
// ---------------------------------------------------------------------------

/**
 * Distinguishes how a payment_operations row reached `status = 'failed'`.
 * NULL for legacy rows — treated as 'stripe_confirmed_failed' by the retry
 * gate (safe conservative default). No DB enum — validated in application
 * code to avoid migration churn on future value additions.
 *
 * Source: docs/handoffs/stripe-refund-r2-lb-fixes.handoff.md (LB-R2R3-2)
 */
export type FailureProvenance =
  | 'auto_timeout_unverified'
  | 'operator_verified_absent'
  | 'stripe_confirmed_failed'
  | 'cron_retry_exhausted'
  | 'idempotency_conflict';

export const paymentOperations = pgTable("payment_operations", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  orderId: varchar("order_id", { length: 26 }).references(() => orders.id),
  // ADR-015 Sprint 1b W1: nullable FK to order_groups for multi-vendor operations.
  // Populated by W2 createPaymentOp callers; NULL for legacy single-seller rows.
  orderGroupId: varchar("order_group_id", { length: 26 }).references(() => orderGroups.id, { onDelete: "set null" }),
  // Type of Stripe operation
  type: varchar("type", { length: 30 }).notNull(),
  // charge | refund | transfer | reversal | dispute_hold | dispute_release
  provider: varchar("provider", { length: 30 }).notNull().default("stripe"),
  providerObjectId: varchar("provider_object_id", { length: 255 }),
  idempotencyKey: varchar("idempotency_key", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending | succeeded | failed | indeterminate_5xx
  // indeterminate_5xx: Stripe returned 5xx after accepting the request — side
  // effect is unknown and retry with the same idempotency key is unsafe
  // (Stripe caches the 5xx for 24h). Reconciled out-of-band via webhooks or
  // the daily reconciliation job (LB-3 / R1).
  lastError: varchar("last_error", { length: 1000 }),
  amountCents: integer("amount_cents"),
  // R2-R3 (LB-R2R3-2): distinguishes Stripe-confirmed failures from cron
  // auto-timeouts. NULL for legacy rows (safe default: treated as
  // stripe_confirmed_failed by the retry gate). No DB enum — see FailureProvenance.
  failureProvenance: varchar("failure_provenance", { length: 40 }),
  // R2-R3 (LB-R2R3-2): set by succeedAutoFailedOp when a late webhook arrives
  // after the cron has auto-failed the op. Preserves audit trail for the
  // out-of-order recovery path.
  resurrectedAt: timestamp("resurrected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  index("payment_operations_order_id_idx").on(table.orderId),
  index("payment_operations_order_group_id_idx").on(table.orderGroupId),
  index("payment_operations_status_idx").on(table.status),
]);
