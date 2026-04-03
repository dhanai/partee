CREATE TABLE IF NOT EXISTS "round_message_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "emoji" "reaction_emoji" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF to_regclass('public.round_messages') IS NOT NULL THEN
    BEGIN
      ALTER TABLE "round_message_reactions"
        ADD CONSTRAINT "round_message_reactions_message_id_round_messages_id_fk"
        FOREIGN KEY ("message_id") REFERENCES "round_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    ALTER TABLE "round_message_reactions"
      ADD CONSTRAINT "round_message_reactions_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "round_msg_reactions_msg_user_emoji_unique"
  ON "round_message_reactions" ("message_id", "user_id", "emoji");

CREATE INDEX IF NOT EXISTS "round_msg_reactions_message_idx"
  ON "round_message_reactions" ("message_id");
