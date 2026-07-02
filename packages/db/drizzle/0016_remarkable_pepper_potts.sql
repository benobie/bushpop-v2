ALTER TABLE "listing_reports" DROP CONSTRAINT "listing_reports_reporter_listing_unique";--> statement-breakpoint
ALTER TABLE "listing_reports" DROP CONSTRAINT "listing_reports_channel_id_channels_id_fk";
--> statement-breakpoint
DROP INDEX "listing_reports_channel_id_idx";--> statement-breakpoint
ALTER TABLE "listing_scores" ALTER COLUMN "nudge_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_scores" ADD COLUMN "scored_from_version" integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_reports_active_unique" ON "listing_reports" USING btree ("reporter_id","channel_listing_id") WHERE "listing_reports"."status" NOT IN ('dismissed');--> statement-breakpoint
ALTER TABLE "listing_reports" DROP COLUMN "channel_id";