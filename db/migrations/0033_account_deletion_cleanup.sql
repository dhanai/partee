-- messages.user_id: nullable + SET NULL so messages survive user deletion
ALTER TABLE "messages" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_user_id_users_id_fk";
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- groups.created_by: nullable + SET NULL so groups survive creator deletion
ALTER TABLE "groups" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "groups" DROP CONSTRAINT IF EXISTS "groups_created_by_users_id_fk";
ALTER TABLE "groups"
  ADD CONSTRAINT "groups_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
