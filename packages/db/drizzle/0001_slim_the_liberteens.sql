ALTER TABLE "inventory_items" ADD COLUMN "ai_title" varchar(255);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ai_description" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ai_tags" jsonb;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ai_suggested_category" varchar(100);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ai_suggested_colour" varchar(30);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ai_suggested_material" varchar(50);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ai_confidence" real;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ai_prompt_version" varchar(20);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ai_model" varchar(50);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ai_status" varchar(20) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ai_enriched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ai_last_error" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ai_image_hash" varchar(64);