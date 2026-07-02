CREATE TABLE "wishlists" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"channel_listing_id" varchar(26) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlists_user_listing_unique" UNIQUE("user_id","channel_listing_id")
);
--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_channel_listing_id_channel_listings_id_fk" FOREIGN KEY ("channel_listing_id") REFERENCES "public"."channel_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wishlists_user_id_idx" ON "wishlists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wishlists_channel_listing_id_idx" ON "wishlists" USING btree ("channel_listing_id");