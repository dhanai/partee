ALTER TABLE "group_members"
ADD COLUMN IF NOT EXISTS "mute_group_push" boolean NOT NULL DEFAULT false;
