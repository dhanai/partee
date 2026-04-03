DO $$
BEGIN
  IF to_regclass('public.round_messages') IS NOT NULL THEN
    ALTER TABLE "round_messages" ADD COLUMN IF NOT EXISTS "parent_id" uuid;
  END IF;
END $$;
