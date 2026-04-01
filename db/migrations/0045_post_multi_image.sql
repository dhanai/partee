ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "image_urls" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "posts"
SET "image_urls" = CASE
  WHEN "image_url" IS NULL OR length(trim("image_url")) = 0 THEN '[]'::jsonb
  ELSE jsonb_build_array("image_url")
END
WHERE "image_urls" = '[]'::jsonb;
