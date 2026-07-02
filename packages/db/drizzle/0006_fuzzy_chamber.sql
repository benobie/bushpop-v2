CREATE TABLE "payment_operations" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"order_id" varchar(26) NOT NULL,
	"type" varchar(30) NOT NULL,
	"provider" varchar(30) DEFAULT 'stripe' NOT NULL,
	"provider_object_id" varchar(255),
	"idempotency_key" varchar(255),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"last_error" varchar(1000),
	"amount_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"order_id" varchar(26) NOT NULL,
	"initiated_by" varchar(26),
	"type" varchar(20) DEFAULT 'full' NOT NULL,
	"amount_cents" integer NOT NULL,
	"platform_fee_refunded_cents" integer,
	"reason" varchar(500),
	"stripe_refund_id" varchar(255),
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payout_holds" ALTER COLUMN "status" SET DATA TYPE varchar(30);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_label_id" varchar(255);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "last_tracking_status" varchar(100);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "last_tracking_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "sla_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_international" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "payout_holds" ADD COLUMN "frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payout_holds" ADD COLUMN "next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payout_holds" ADD COLUMN "failure_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "payout_holds" ADD COLUMN "buyer_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payout_holds" ADD COLUMN "hold_policy_applied" varchar(100);--> statement-breakpoint
ALTER TABLE "payout_holds" ADD COLUMN "delivery_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_initiated_by_user_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_operations_order_id_idx" ON "payment_operations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_operations_status_idx" ON "payment_operations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "refunds_order_id_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_status_created_at_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payout_holds_release_eligibility_idx" ON "payout_holds" USING btree ("status","frozen_at","delivery_confirmed_at","buyer_confirmed_at");--> statement-breakpoint
CREATE INDEX "payout_holds_retry_idx" ON "payout_holds" USING btree ("status","next_retry_at");--> statement-breakpoint
-- Partial unique index: at most one active refund per order (Drizzle 0.45.x cannot express this natively)
CREATE UNIQUE INDEX IF NOT EXISTS "refunds_order_active_unique" ON "refunds" ("order_id") WHERE status IN ('pending', 'pending_reversal', 'processed');