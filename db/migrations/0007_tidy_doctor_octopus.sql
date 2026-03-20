ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notifications_last_viewed_at" timestamp with time zone;
