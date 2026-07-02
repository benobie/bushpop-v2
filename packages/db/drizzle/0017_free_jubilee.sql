ALTER TABLE "inventory_item_images" ADD COLUMN "aspect_ratio" numeric;--> statement-breakpoint
ALTER TABLE "inventory_item_images" ADD COLUMN "backfill_status" varchar(30);