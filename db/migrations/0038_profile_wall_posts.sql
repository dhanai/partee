ALTER TABLE "posts"
ADD COLUMN IF NOT EXISTS "profile_user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS "hidden_on_profile" boolean NOT NULL DEFAULT false;

UPDATE "posts"
SET "profile_user_id" = "user_id"
WHERE "scope" = 'profile' AND "profile_user_id" IS NULL;

CREATE INDEX IF NOT EXISTS "posts_profile_user_idx" ON "posts" ("profile_user_id");
CREATE INDEX IF NOT EXISTS "posts_profile_user_created_idx" ON "posts" ("profile_user_id", "created_at");
