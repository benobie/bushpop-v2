CREATE TABLE "bulk_batches" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"owner_id" varchar(26) NOT NULL,
	"label" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progression_events" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"event_name" varchar(50) NOT NULL,
	"user_id" varchar(26),
	"entity_type" varchar(50),
	"entity_id" varchar(26),
	"source_event_id" varchar(26),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "batch_id" varchar(26);--> statement-breakpoint
ALTER TABLE "bulk_batches" ADD CONSTRAINT "bulk_batches_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bulk_batches_owner_created_idx" ON "bulk_batches" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "progression_events_user_created_idx" ON "progression_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "progression_events_event_name_idx" ON "progression_events" USING btree ("event_name");--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_batch_id_bulk_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."bulk_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_items_batch_id_idx" ON "inventory_items" USING btree ("batch_id");--> statement-breakpoint
-- Retention-engine Phase A metrics views (docs/BRIEF-retention-engine.md §7).
-- Read-only, computed from progression_events + ai_generations. Not
-- drizzle-schema-tracked (no corresponding pgTable) — safe from future
-- `db:generate` diffs, hand-maintained here like the check constraint above.
CREATE VIEW "progression_metric_activation" AS
SELECT
	u."id" AS "user_id",
	u."created_at" AS "signup_at",
	MIN(pe."created_at") AS "first_publish_at",
	(MIN(pe."created_at") IS NOT NULL AND MIN(pe."created_at") - u."created_at" <= INTERVAL '24 hours') AS "activated_within_24h"
FROM "user" u
LEFT JOIN "progression_events" pe ON pe."user_id" = u."id" AND pe."event_name" = 'listing.published'
GROUP BY u."id", u."created_at";
--> statement-breakpoint
CREATE VIEW "progression_metric_weekly_listers" AS
SELECT
	"user_id",
	date_trunc('week', "created_at") AS "week_start",
	COUNT(*) AS "listings_published"
FROM "progression_events"
WHERE "event_name" = 'listing.published' AND "user_id" IS NOT NULL
GROUP BY "user_id", date_trunc('week', "created_at");
--> statement-breakpoint
CREATE VIEW "progression_metric_w4_retention" AS
WITH first_week AS (
	SELECT "user_id", MIN(date_trunc('week', "created_at")) AS "cohort_week"
	FROM "progression_events"
	WHERE "event_name" = 'listing.published' AND "user_id" IS NOT NULL
	GROUP BY "user_id"
),
active_weeks AS (
	SELECT DISTINCT "user_id", date_trunc('week', "created_at") AS "active_week"
	FROM "progression_events"
	WHERE "event_name" = 'listing.published' AND "user_id" IS NOT NULL
)
SELECT
	f."user_id",
	f."cohort_week",
	EXISTS (
		SELECT 1 FROM active_weeks w
		WHERE w."user_id" = f."user_id" AND w."active_week" = f."cohort_week" + INTERVAL '4 weeks'
	) AS "retained_at_w4"
FROM first_week f;
--> statement-breakpoint
CREATE VIEW "progression_metric_catalogue_quality" AS
SELECT
	percentile_cont(0.5) WITHIN GROUP (ORDER BY (("metadata"->>'strengthScore')::numeric)) AS "median_strength_score",
	COUNT(*) AS "sample_size"
FROM "progression_events"
WHERE "event_name" = 'listing.published' AND "metadata"->>'strengthScore' IS NOT NULL;
--> statement-breakpoint
CREATE VIEW "progression_metric_ai_kept_rate" AS
SELECT
	COUNT(*) FILTER (WHERE "status" = 'completed') AS "completed_generations",
	AVG(
		CASE WHEN "status" = 'completed' AND "outcome" IS NOT NULL
			AND (jsonb_array_length("outcome"->'kept') + jsonb_array_length("outcome"->'edited')) > 0
		THEN jsonb_array_length("outcome"->'kept')::numeric
			/ (jsonb_array_length("outcome"->'kept') + jsonb_array_length("outcome"->'edited'))
		END
	) AS "avg_kept_rate"
FROM "ai_generations";