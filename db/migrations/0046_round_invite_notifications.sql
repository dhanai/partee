DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_event_type'
      AND e.enumlabel = 'round_invite'
  ) THEN
    ALTER TYPE "notification_event_type" ADD VALUE 'round_invite';
  END IF;
END $$;
