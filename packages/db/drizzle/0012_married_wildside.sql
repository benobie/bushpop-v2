CREATE TABLE "notification_preferences" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"type" varchar(100) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_type_channel_unique" UNIQUE("user_id","type","channel")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"channel" varchar(20) DEFAULT 'email' NOT NULL,
	"type" varchar(100) NOT NULL,
	"priority" varchar(20) NOT NULL,
	"payload" jsonb NOT NULL,
	"dedup_key" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_message_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedup_key_unique" UNIQUE("dedup_key")
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;