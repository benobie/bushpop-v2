ALTER TABLE "channels" ALTER COLUMN "currency" SET DEFAULT 'AUD';--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_shipping_address_id_addresses_id_fk" FOREIGN KEY ("shipping_address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_price_positive" CHECK ("cart_items"."price_cents" > 0);--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_total_positive" CHECK ("checkout_sessions"."total_cents" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_positive" CHECK ("orders"."total_cents" > 0);--> statement-breakpoint
ALTER TABLE "payout_holds" ADD CONSTRAINT "payout_holds_amount_positive" CHECK ("payout_holds"."amount_cents" > 0);