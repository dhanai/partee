-- Rename group_announcements → posts
ALTER TABLE "group_announcements" RENAME TO "posts";

-- Make group_id nullable (was NOT NULL)
ALTER TABLE "posts" ALTER COLUMN "group_id" DROP NOT NULL;

-- Add scope column
ALTER TABLE "posts" ADD COLUMN "scope" text NOT NULL DEFAULT 'group';

-- Rename indexes
ALTER INDEX "group_announcements_group_idx" RENAME TO "posts_group_idx";
ALTER INDEX "group_announcements_group_created_idx" RENAME TO "posts_group_created_idx";

-- Add user+created index for future profile feeds
CREATE INDEX "posts_user_created_idx" ON "posts" ("user_id", "created_at");

-- Rename announcement_likes → post_likes
ALTER TABLE "announcement_likes" RENAME TO "post_likes";
ALTER TABLE "post_likes" RENAME COLUMN "announcement_id" TO "post_id";

-- Rename indexes
ALTER INDEX "announcement_likes_unique" RENAME TO "post_likes_unique";
ALTER INDEX "announcement_likes_announcement_idx" RENAME TO "post_likes_post_idx";

-- Rename announcement_comments → post_comments
ALTER TABLE "announcement_comments" RENAME TO "post_comments";
ALTER TABLE "post_comments" RENAME COLUMN "announcement_id" TO "post_id";

-- Rename indexes
ALTER INDEX "announcement_comments_announcement_idx" RENAME TO "post_comments_post_idx";
ALTER INDEX "announcement_comments_created_idx" RENAME TO "post_comments_created_idx";
