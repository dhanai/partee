CREATE TABLE IF NOT EXISTS "house_promo_config" (
  "slot" text PRIMARY KEY NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "target_url" text,
  "media_url" text,
  "media_kind" text CHECK ("media_kind" IS NULL OR "media_kind" IN ('image', 'video')),
  "title" text NOT NULL DEFAULT '',
  "subtitle" text NOT NULL DEFAULT '',
  "cta_label" text NOT NULL DEFAULT '',
  "discover_mix_percent" integer NOT NULL DEFAULT 0 CHECK ("discover_mix_percent" >= 0 AND "discover_mix_percent" <= 100),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "house_promo_config" ("slot", "enabled", "discover_mix_percent")
VALUES
  ('discover_inline', false, 0),
  ('game_end_fullscreen', false, 0)
ON CONFLICT ("slot") DO NOTHING;
