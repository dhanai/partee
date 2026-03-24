CREATE TABLE IF NOT EXISTS "page_content_config" (
  "page_key" text PRIMARY KEY NOT NULL,
  "content" jsonb NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
