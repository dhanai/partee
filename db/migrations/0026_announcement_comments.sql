DO $$
BEGIN
  IF to_regclass('public.group_announcements') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS "announcement_comments" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "announcement_id" uuid NOT NULL REFERENCES "group_announcements"("id") ON DELETE CASCADE,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "body" text NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "announcement_comments_announcement_idx" ON "announcement_comments" ("announcement_id");
    CREATE INDEX IF NOT EXISTS "announcement_comments_created_idx" ON "announcement_comments" ("announcement_id", "created_at");
  END IF;
END $$;
