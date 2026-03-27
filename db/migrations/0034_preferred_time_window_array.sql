-- Convert preferred_time_window from single enum to text array
ALTER TABLE "rounds"
  ALTER COLUMN "preferred_time_window"
  TYPE text[]
  USING CASE
    WHEN "preferred_time_window" IS NOT NULL
    THEN ARRAY["preferred_time_window"::text]
    ELSE NULL
  END;
