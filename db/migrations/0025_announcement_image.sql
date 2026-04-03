DO $$
BEGIN
  IF to_regclass('public.group_announcements') IS NOT NULL THEN
    ALTER TABLE "group_announcements" ADD COLUMN IF NOT EXISTS "image_url" text;
  ELSIF to_regclass('public.posts') IS NOT NULL THEN
    ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "image_url" text;
  END IF;
END $$;
