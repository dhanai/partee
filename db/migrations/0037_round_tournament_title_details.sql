ALTER TABLE "rounds" ADD COLUMN IF NOT EXISTS "tournament_title" text;
--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN IF NOT EXISTS "tournament_details" text;
