ALTER TABLE "orders" ADD COLUMN "buyer_email_snapshot" varchar(255);--> statement-breakpoint
-- Backfill from the buyer's current account email. Placeholder guest addresses
-- (`*@guest.bushpop.com.au`) are deliberately left NULL rather than snapshotted:
-- they are undeliverable, and the email worker falls back to the live join when
-- the snapshot is NULL, which preserves the existing skip behaviour for those
-- rows exactly.
UPDATE "orders" AS o
SET "buyer_email_snapshot" = u."email"
FROM "user" AS u
WHERE u."id" = o."buyer_id"
  AND u."email" NOT LIKE '%@guest.bushpop.com.au';