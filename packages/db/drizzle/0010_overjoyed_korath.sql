CREATE TABLE "listing_reports" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"channel_listing_id" varchar(26) NOT NULL,
	"channel_id" varchar(26) NOT NULL,
	"reporter_id" varchar(26) NOT NULL,
	"reason" varchar(50) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_reports_reporter_listing_unique" UNIQUE("reporter_id","channel_listing_id")
);
--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_channel_listing_id_channel_listings_id_fk" FOREIGN KEY ("channel_listing_id") REFERENCES "public"."channel_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_reports_channel_listing_id_idx" ON "listing_reports" USING btree ("channel_listing_id");--> statement-breakpoint
CREATE INDEX "listing_reports_channel_id_idx" ON "listing_reports" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "listing_reports_status_idx" ON "listing_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "listing_reports_reporter_id_idx" ON "listing_reports" USING btree ("reporter_id");