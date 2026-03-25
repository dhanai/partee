CREATE TABLE IF NOT EXISTS "announcement_likes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL REFERENCES "group_announcements"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_likes_unique" ON "announcement_likes" ("announcement_id", "user_id");
CREATE INDEX IF NOT EXISTS "announcement_likes_announcement_idx" ON "announcement_likes" ("announcement_id");
