DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'round_mode' AND e.enumlabel = 'tournament'
  ) THEN
    ALTER TYPE "round_mode" ADD VALUE 'tournament';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "rounds" DROP CONSTRAINT IF EXISTS "rounds_total_spots_check";
--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_total_spots_check" CHECK (
  (
    "mode" = 'tournament'::"round_mode"
    AND "total_spots" >= 2
    AND "total_spots" <= 200
  )
  OR (
    "mode" IN ('scheduled'::"round_mode", 'planning'::"round_mode")
    AND "total_spots" >= 2
    AND "total_spots" <= 4
  )
);
