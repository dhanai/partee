CREATE TYPE "public"."join_policy" AS ENUM('instant', 'approval');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('forming', 'confirmed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."round_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."spot_status" AS ENUM('invited', 'confirmed', 'declined', 'requested');--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_place_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"metadata" jsonb NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"course_name" text NOT NULL,
	"tee_time" timestamp with time zone NOT NULL,
	"total_spots" integer NOT NULL,
	"visibility" "round_visibility" NOT NULL,
	"status" "round_status" DEFAULT 'forming' NOT NULL,
	"join_policy" "join_policy" DEFAULT 'instant' NOT NULL,
	"invite_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rounds_total_spots_check" CHECK ("rounds"."total_spots" >= 2 AND "rounds"."total_spots" <= 4)
);
--> statement-breakpoint
CREATE TABLE "spots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "spot_status" NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"name" text NOT NULL,
	"avatar" text,
	"handicap" numeric(5, 2),
	"home_course" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "courses_google_place_id_unique" ON "courses" USING btree ("google_place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_invite_token_unique" ON "rounds" USING btree ("invite_token");--> statement-breakpoint
CREATE INDEX "rounds_host_id_idx" ON "rounds" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "rounds_tee_time_idx" ON "rounds" USING btree ("tee_time");--> statement-breakpoint
CREATE INDEX "spots_round_id_idx" ON "spots" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "spots_user_id_idx" ON "spots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spots_round_id_user_id_unique" ON "spots" USING btree ("round_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_id_unique" ON "users" USING btree ("clerk_id");