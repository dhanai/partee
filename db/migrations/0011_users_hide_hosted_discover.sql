ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hide_hosted_rounds_from_discover" boolean DEFAULT false NOT NULL;
