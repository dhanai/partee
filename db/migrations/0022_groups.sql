-- Groups feature: new tables + extend rounds and conversations

CREATE TYPE "group_join_policy" AS ENUM ('public', 'approval', 'invite_only');
CREATE TYPE "group_member_role" AS ENUM ('owner', 'admin', 'member');
CREATE TYPE "group_join_request_status" AS ENUM ('pending', 'accepted', 'declined');

ALTER TYPE "conversation_type" ADD VALUE IF NOT EXISTS 'group';

CREATE TABLE IF NOT EXISTS "groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "image_url" text,
  "join_policy" "group_join_policy" DEFAULT 'public' NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "groups_created_by_idx" ON "groups" ("created_by");

CREATE TABLE IF NOT EXISTS "group_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "group_member_role" DEFAULT 'member' NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "group_members_group_user_unique" ON "group_members" ("group_id", "user_id");
CREATE INDEX IF NOT EXISTS "group_members_group_idx" ON "group_members" ("group_id");
CREATE INDEX IF NOT EXISTS "group_members_user_idx" ON "group_members" ("user_id");

CREATE TABLE IF NOT EXISTS "group_join_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" "group_join_request_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "group_join_requests_group_user_unique" ON "group_join_requests" ("group_id", "user_id");
CREATE INDEX IF NOT EXISTS "group_join_requests_group_idx" ON "group_join_requests" ("group_id");

CREATE TABLE IF NOT EXISTS "group_announcements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "is_pinned" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "group_announcements_group_idx" ON "group_announcements" ("group_id");
CREATE INDEX IF NOT EXISTS "group_announcements_group_created_idx" ON "group_announcements" ("group_id", "created_at");

ALTER TABLE "rounds" ADD COLUMN IF NOT EXISTS "group_id" uuid;
CREATE INDEX IF NOT EXISTS "rounds_group_id_idx" ON "rounds" ("group_id");

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "group_id" uuid;
CREATE INDEX IF NOT EXISTS "conversations_group_id_idx" ON "conversations" ("group_id");
