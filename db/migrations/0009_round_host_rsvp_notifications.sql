DO $$ BEGIN
 CREATE TYPE "public"."notification_event_type" AS ENUM('round_rsvp_accepted', 'round_rsvp_declined');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "in_app_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"type" "notification_event_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "in_app_notifications_recipient_user_id_idx" ON "in_app_notifications" USING btree ("recipient_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "in_app_notifications_recipient_created_idx" ON "in_app_notifications" USING btree ("recipient_user_id","created_at");
