ALTER TABLE "post_comments"
  ADD COLUMN IF NOT EXISTS "parent_comment_id" uuid REFERENCES "post_comments"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "reply_to_comment_id" uuid REFERENCES "post_comments"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "post_comments_parent_created_idx"
  ON "post_comments" ("post_id", "parent_comment_id", "created_at");

CREATE TABLE IF NOT EXISTS "post_comment_likes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "comment_id" uuid NOT NULL REFERENCES "post_comments"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "post_comment_likes_unique"
  ON "post_comment_likes" ("comment_id", "user_id");

CREATE INDEX IF NOT EXISTS "post_comment_likes_comment_idx"
  ON "post_comment_likes" ("comment_id");
