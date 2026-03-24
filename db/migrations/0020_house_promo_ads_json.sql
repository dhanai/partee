ALTER TABLE "house_promo_config"
ADD COLUMN IF NOT EXISTS "ads" jsonb NOT NULL DEFAULT '[]'::jsonb;
