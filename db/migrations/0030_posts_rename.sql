-- Idempotent: supports legacy group_announcements / announcement_* or already-unified posts / post_*.
DO $$
BEGIN
  IF to_regclass('public.group_announcements') IS NOT NULL AND to_regclass('public.posts') IS NULL THEN
    ALTER TABLE "group_announcements" RENAME TO "posts";
  END IF;

  IF to_regclass('public.posts') IS NOT NULL THEN
    ALTER TABLE "posts" ALTER COLUMN "group_id" DROP NOT NULL;
    ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'group';
  END IF;

  IF to_regclass('public.posts') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'group_announcements_group_idx')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'posts_group_idx') THEN
      ALTER INDEX "group_announcements_group_idx" RENAME TO "posts_group_idx";
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'group_announcements_group_created_idx')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'posts_group_created_idx') THEN
      ALTER INDEX "group_announcements_group_created_idx" RENAME TO "posts_group_created_idx";
    END IF;
    CREATE INDEX IF NOT EXISTS "posts_user_created_idx" ON "posts" ("user_id", "created_at");
  END IF;

  IF to_regclass('public.announcement_likes') IS NOT NULL AND to_regclass('public.post_likes') IS NULL THEN
    ALTER TABLE "announcement_likes" RENAME TO "post_likes";
  END IF;

  IF to_regclass('public.post_likes') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'post_likes' AND column_name = 'announcement_id'
    ) THEN
      ALTER TABLE "post_likes" RENAME COLUMN "announcement_id" TO "post_id";
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'announcement_likes_unique')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'post_likes_unique') THEN
      ALTER INDEX "announcement_likes_unique" RENAME TO "post_likes_unique";
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'announcement_likes_announcement_idx')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'post_likes_post_idx') THEN
      ALTER INDEX "announcement_likes_announcement_idx" RENAME TO "post_likes_post_idx";
    END IF;
  END IF;

  IF to_regclass('public.announcement_comments') IS NOT NULL AND to_regclass('public.post_comments') IS NULL THEN
    ALTER TABLE "announcement_comments" RENAME TO "post_comments";
  END IF;

  IF to_regclass('public.post_comments') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'post_comments' AND column_name = 'announcement_id'
    ) THEN
      ALTER TABLE "post_comments" RENAME COLUMN "announcement_id" TO "post_id";
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'announcement_comments_announcement_idx')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'post_comments_post_idx') THEN
      ALTER INDEX "announcement_comments_announcement_idx" RENAME TO "post_comments_post_idx";
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'announcement_comments_created_idx')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'post_comments_created_idx') THEN
      ALTER INDEX "announcement_comments_created_idx" RENAME TO "post_comments_created_idx";
    END IF;
  END IF;
END $$;
