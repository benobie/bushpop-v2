DROP INDEX "orders_checkout_session_id_idx";--> statement-breakpoint
DROP INDEX "payout_holds_order_id_idx";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_session_id_unique" UNIQUE("checkout_session_id");--> statement-breakpoint
ALTER TABLE "payout_holds" ADD CONSTRAINT "payout_holds_order_id_unique" UNIQUE("order_id");