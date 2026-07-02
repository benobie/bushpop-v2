-- ============================================================================
-- Sprint 1b W1 — ADR-015 multi-vendor checkout scaffold
-- ============================================================================
-- This migration is additive EXCEPT for `ALTER TABLE "carts" DROP COLUMN "seller_id"`
-- (line near bottom of file). That drop is destructive — any pre-existing cart
-- rows lose their seller_id. Acceptable because Piklo V2 is pre-launch.
--
-- Rollback strategy: counter-migration 0019 that adds back `seller_id` as
-- nullable, then drops the four new tables + the payment_operations.order_group_id
-- column. Feasible only until W2 starts persisting multi-seller order_groups.
--
-- Hand-edited partial unique indexes appear at the end of this file (Drizzle
-- 0.45.x does not support filtered unique indexes natively).
-- ============================================================================

CREATE TABLE "allocation_refunds" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"allocation_id" varchar(26) NOT NULL,
	"order_group_id" varchar(26) NOT NULL,
	"initiated_by" varchar(26),
	"type" varchar(20) DEFAULT 'full' NOT NULL,
	"amount_cents" integer NOT NULL,
	"platform_fee_refunded_cents" integer,
	"reason" varchar(500),
	"stripe_refund_id" varchar(255),
	"stripe_transfer_reversal_id" varchar(255),
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocation_refunds_amount_positive" CHECK ("allocation_refunds"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_group_allocation_items" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"allocation_id" varchar(26) NOT NULL,
	"order_group_id" varchar(26) NOT NULL,
	"channel_listing_id" varchar(26) NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocation_items_allocation_listing_unique" UNIQUE("allocation_id","channel_listing_id"),
	CONSTRAINT "allocation_items_price_positive" CHECK ("order_group_allocation_items"."price_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_group_seller_allocations" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"order_group_id" varchar(26) NOT NULL,
	"seller_id" varchar(26) NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"shipping_cents" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"seller_proceeds_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"stripe_transfer_id" varchar(255),
	"stripe_transfer_idempotency_key" varchar(255),
	"order_id" varchar(26),
	"transfer_attempts" integer DEFAULT 0 NOT NULL,
	"last_transfer_error" varchar(1000),
	"frozen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocations_group_seller_unique" UNIQUE("order_group_id","seller_id"),
	CONSTRAINT "allocations_total_positive" CHECK ("order_group_seller_allocations"."total_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_groups" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"buyer_id" varchar(26) NOT NULL,
	"channel_id" varchar(26) NOT NULL,
	"cart_id" varchar(26) NOT NULL,
	"status" varchar(30) DEFAULT 'created' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"charge_type" varchar(20) NOT NULL,
	"quote_hash" varchar(64) NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"shipping_cents" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"seller_proceeds_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"stripe_client_secret" varchar(500),
	"stripe_transfer_group" varchar(255),
	"shipping_address_id" varchar(26),
	"shipping_address_snapshot" jsonb,
	"has_pending_reconciliation" boolean DEFAULT false NOT NULL,
	"reconciliation_locked_until" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_groups_total_positive" CHECK ("order_groups"."total_cents" > 0),
	CONSTRAINT "order_groups_charge_type_enum" CHECK ("order_groups"."charge_type" IN ('destination','sct')),
	CONSTRAINT "order_groups_currency_aud" CHECK ("order_groups"."currency" = 'AUD')
);
--> statement-breakpoint
ALTER TABLE "carts" DROP CONSTRAINT "carts_seller_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "carts_seller_id_idx";--> statement-breakpoint
ALTER TABLE "payment_operations" ADD COLUMN "order_group_id" varchar(26);--> statement-breakpoint
ALTER TABLE "allocation_refunds" ADD CONSTRAINT "allocation_refunds_allocation_id_order_group_seller_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."order_group_seller_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_refunds" ADD CONSTRAINT "allocation_refunds_order_group_id_order_groups_id_fk" FOREIGN KEY ("order_group_id") REFERENCES "public"."order_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_refunds" ADD CONSTRAINT "allocation_refunds_initiated_by_user_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_group_allocation_items" ADD CONSTRAINT "order_group_allocation_items_allocation_id_order_group_seller_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."order_group_seller_allocations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_group_allocation_items" ADD CONSTRAINT "order_group_allocation_items_order_group_id_order_groups_id_fk" FOREIGN KEY ("order_group_id") REFERENCES "public"."order_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_group_allocation_items" ADD CONSTRAINT "order_group_allocation_items_channel_listing_id_channel_listings_id_fk" FOREIGN KEY ("channel_listing_id") REFERENCES "public"."channel_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_group_seller_allocations" ADD CONSTRAINT "order_group_seller_allocations_order_group_id_order_groups_id_fk" FOREIGN KEY ("order_group_id") REFERENCES "public"."order_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_group_seller_allocations" ADD CONSTRAINT "order_group_seller_allocations_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_group_seller_allocations" ADD CONSTRAINT "order_group_seller_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_groups" ADD CONSTRAINT "order_groups_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_groups" ADD CONSTRAINT "order_groups_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_groups" ADD CONSTRAINT "order_groups_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_groups" ADD CONSTRAINT "order_groups_shipping_address_id_addresses_id_fk" FOREIGN KEY ("shipping_address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "allocation_refunds_allocation_id_idx" ON "allocation_refunds" USING btree ("allocation_id");--> statement-breakpoint
CREATE INDEX "allocation_refunds_order_group_id_idx" ON "allocation_refunds" USING btree ("order_group_id");--> statement-breakpoint
CREATE INDEX "allocation_refunds_status_idx" ON "allocation_refunds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "allocation_items_allocation_id_idx" ON "order_group_allocation_items" USING btree ("allocation_id");--> statement-breakpoint
CREATE INDEX "allocation_items_order_group_id_idx" ON "order_group_allocation_items" USING btree ("order_group_id");--> statement-breakpoint
CREATE INDEX "allocations_order_group_id_idx" ON "order_group_seller_allocations" USING btree ("order_group_id");--> statement-breakpoint
CREATE INDEX "allocations_seller_id_idx" ON "order_group_seller_allocations" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "allocations_status_idx" ON "order_group_seller_allocations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "allocations_stripe_transfer_id_idx" ON "order_group_seller_allocations" USING btree ("stripe_transfer_id");--> statement-breakpoint
CREATE INDEX "order_groups_buyer_id_idx" ON "order_groups" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "order_groups_cart_id_idx" ON "order_groups" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "order_groups_status_idx" ON "order_groups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_groups_stripe_pi_idx" ON "order_groups" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "order_groups_status_created_at_idx" ON "order_groups" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_order_group_id_order_groups_id_fk" FOREIGN KEY ("order_group_id") REFERENCES "public"."order_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_operations_order_group_id_idx" ON "payment_operations" USING btree ("order_group_id");--> statement-breakpoint
ALTER TABLE "carts" DROP COLUMN "seller_id";
--> statement-breakpoint

-- ============================================================================
-- HAND-EDITED: partial unique indexes (preserve on regeneration)
-- ============================================================================
-- These must be re-applied if this migration is ever regenerated by drizzle-kit.

-- Ensures at most one active order_group per cart (mirrors the existing
-- checkout_sessions_cart_active_unique pattern).
CREATE UNIQUE INDEX IF NOT EXISTS "order_groups_cart_active_unique"
  ON "order_groups" ("cart_id")
  WHERE "status" IN ('created', 'payment_pending', 'requires_action', 'confirming');
--> statement-breakpoint

-- Prevents duplicate Stripe transfer idempotency keys (W3 LB-M2).
CREATE UNIQUE INDEX IF NOT EXISTS "allocation_transfer_idem_unique"
  ON "order_group_seller_allocations" ("stripe_transfer_idempotency_key")
  WHERE "stripe_transfer_idempotency_key" IS NOT NULL;
--> statement-breakpoint

-- At most one active refund per allocation (mirrors refunds_order_active_unique).
CREATE UNIQUE INDEX IF NOT EXISTS "allocation_refunds_allocation_active_unique"
  ON "allocation_refunds" ("allocation_id")
  WHERE "status" IN ('pending', 'pending_reversal', 'processed');