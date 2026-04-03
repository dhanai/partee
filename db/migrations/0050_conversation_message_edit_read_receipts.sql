ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

ALTER TABLE "conversation_read_receipts"
  ADD COLUMN IF NOT EXISTS "last_read_message_id" uuid REFERENCES "messages"("id") ON DELETE SET NULL;
