CREATE TABLE IF NOT EXISTS "site_meta_config" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL DEFAULT '',
  "description" text NOT NULL DEFAULT '',
  "og_title" text NOT NULL DEFAULT '',
  "og_description" text NOT NULL DEFAULT '',
  "og_image_url" text,
  "twitter_title" text NOT NULL DEFAULT '',
  "twitter_description" text NOT NULL DEFAULT '',
  "twitter_image_url" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
