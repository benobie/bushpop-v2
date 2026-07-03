CREATE TABLE "ai_generations" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"seller_id" varchar(26) NOT NULL,
	"inventory_item_id" varchar(26) NOT NULL,
	"trigger" varchar(20) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"model" varchar(50) NOT NULL,
	"prompt_version" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd_micros" integer,
	"latency_ms" integer,
	"confidence" real,
	"raw_output" jsonb,
	"resolved_output" jsonb,
	"outcome" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "asking_price_cents" integer;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "rrp_cents" integer;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "size_scale" varchar(20);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "measurements" jsonb;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "shipping_option" varchar(20);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "parcel_size" varchar(10);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ai_suggested_brand" varchar(100);--> statement-breakpoint
ALTER TABLE "listing_scores" ADD COLUMN "breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generations_seller_created_idx" ON "ai_generations" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_generations_item_idx" ON "ai_generations" USING btree ("inventory_item_id");--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_asking_price_cents_check" CHECK ("inventory_items"."asking_price_cents" IS NULL OR "inventory_items"."asking_price_cents" > 0);