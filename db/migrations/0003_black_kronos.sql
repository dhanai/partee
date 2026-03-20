CREATE TYPE "public"."round_mode" AS ENUM('scheduled', 'planning');--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "course_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "course_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "tee_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "mode" "round_mode" DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "target_date" timestamp with time zone DEFAULT now() NOT NULL;