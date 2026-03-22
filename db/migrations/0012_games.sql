DO $$ BEGIN
 CREATE TYPE "public"."game_type" AS ENUM('skins', 'wolf', 'best_ball', 'nassau');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."game_session_status" AS ENUM('active', 'completed', 'abandoned');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_type" "game_type" NOT NULL,
	"created_by" uuid NOT NULL,
	"round_id" uuid,
	"status" "game_session_status" DEFAULT 'active' NOT NULL,
	"holes_count" integer DEFAULT 18 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamptz DEFAULT now() NOT NULL,
	"ended_at" timestamptz,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_holes_count_check" CHECK ("holes_count" >= 1 AND "holes_count" <= 27);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_sessions_created_by_idx" ON "game_sessions" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_sessions_round_id_idx" ON "game_sessions" USING btree ("round_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_sessions_status_idx" ON "game_sessions" USING btree ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_session_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"team_id" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_session_players" ADD CONSTRAINT "game_session_players_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_session_players" ADD CONSTRAINT "game_session_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "game_session_players_session_user_unique" ON "game_session_players" USING btree ("session_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_session_players_session_idx" ON "game_session_players" USING btree ("session_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_hole_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"hole_number" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"recorded_by" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_hole_events" ADD CONSTRAINT "game_hole_events_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_hole_events" ADD CONSTRAINT "game_hole_events_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_hole_events" ADD CONSTRAINT "game_hole_events_hole_number_check" CHECK ("hole_number" >= 1 AND "hole_number" <= 27);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "game_hole_events_session_hole_unique" ON "game_hole_events" USING btree ("session_id","hole_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_hole_events_session_idx" ON "game_hole_events" USING btree ("session_id");
