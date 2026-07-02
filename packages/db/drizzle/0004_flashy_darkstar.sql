CREATE TABLE "cart_items" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"cart_id" varchar(26) NOT NULL,
	"channel_listing_id" varchar(26) NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_cart_listing_unique" UNIQUE("cart_id","channel_listing_id")
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"buyer_id" varchar(26) NOT NULL,
	"channel_id" varchar(26) NOT NULL,
	"seller_id" varchar(26) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_buyer_channel_unique" UNIQUE("buyer_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"cart_id" varchar(26) NOT NULL,
	"buyer_id" varchar(26) NOT NULL,
	"channel_id" varchar(26) NOT NULL,
	"status" varchar(30) DEFAULT 'created' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"shipping_cents" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"seller_proceeds_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"stripe_client_secret" varchar(500),
	"shipping_address_id" varchar(26),
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"order_id" varchar(26) NOT NULL,
	"channel_listing_id" varchar(26) NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_order_listing_unique" UNIQUE("order_id","channel_listing_id")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"checkout_session_id" varchar(26) NOT NULL,
	"buyer_id" varchar(26) NOT NULL,
	"seller_id" varchar(26) NOT NULL,
	"channel_id" varchar(26) NOT NULL,
	"status" varchar(30) DEFAULT 'paid' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"shipping_cents" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"seller_proceeds_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"shipping_address_snapshot" jsonb,
	"sender_address_snapshot" jsonb,
	"tracking_number" varchar(255),
	"tracking_carrier" varchar(100),
	"jobs_enqueued_at" timestamp with time zone,
	"stripe_payment_intent_id" varchar(255),
	"stripe_transfer_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_holds" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"order_id" varchar(26) NOT NULL,
	"seller_stripe_account_id" varchar(255) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"transfer_id" varchar(255),
	"version" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'held' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_channel_listing_id_channel_listings_id_fk" FOREIGN KEY ("channel_listing_id") REFERENCES "public"."channel_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_channel_listing_id_channel_listings_id_fk" FOREIGN KEY ("channel_listing_id") REFERENCES "public"."channel_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_holds" ADD CONSTRAINT "payout_holds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "carts_buyer_id_idx" ON "carts" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "carts_seller_id_idx" ON "carts" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "checkout_sessions_cart_id_idx" ON "checkout_sessions" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "checkout_sessions_buyer_id_idx" ON "checkout_sessions" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "checkout_sessions_status_idx" ON "checkout_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "checkout_sessions_stripe_pi_idx" ON "checkout_sessions" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_buyer_id_idx" ON "orders" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "orders_seller_id_idx" ON "orders" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_channel_id_idx" ON "orders" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "orders_checkout_session_id_idx" ON "orders" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE INDEX "payout_holds_order_id_idx" ON "payout_holds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payout_holds_status_idx" ON "payout_holds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payout_holds_seller_account_idx" ON "payout_holds" USING btree ("seller_stripe_account_id");--> statement-breakpoint
-- Partial unique index: only one active checkout session per cart.
-- Active statuses: created, payment_pending, requires_action.
-- Drizzle 0.45.x does not support filtered unique indexes natively — added manually.
CREATE UNIQUE INDEX IF NOT EXISTS "checkout_sessions_cart_active_unique"
  ON "checkout_sessions" ("cart_id")
  WHERE status IN ('created', 'payment_pending', 'requires_action');