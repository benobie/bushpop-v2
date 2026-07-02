CREATE TABLE "listing_scores" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"channel_listing_id" varchar(26) NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"photo_score" integer DEFAULT 0 NOT NULL,
	"description_score" integer DEFAULT 0 NOT NULL,
	"completeness_score" integer DEFAULT 0 NOT NULL,
	"category_score" integer DEFAULT 0 NOT NULL,
	"pricing_score" integer,
	"nudge_key" varchar(50),
	"score_version" varchar(20) DEFAULT 'v1' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_scores_channel_listing_id_unique" UNIQUE("channel_listing_id")
);
--> statement-breakpoint
ALTER TABLE "listing_scores" ADD CONSTRAINT "listing_scores_channel_listing_id_channel_listings_id_fk" FOREIGN KEY ("channel_listing_id") REFERENCES "public"."channel_listings"("id") ON DELETE cascade ON UPDATE no action;