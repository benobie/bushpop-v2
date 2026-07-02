ALTER TABLE "payment_operations" ADD COLUMN "failure_provenance" varchar(40);--> statement-breakpoint
ALTER TABLE "payment_operations" ADD COLUMN "resurrected_at" timestamp with time zone;