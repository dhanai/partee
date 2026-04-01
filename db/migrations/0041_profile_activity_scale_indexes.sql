CREATE INDEX IF NOT EXISTS "rounds_group_created_idx"
ON "rounds" ("group_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "rounds_host_target_date_idx"
ON "rounds" ("host_id", "target_date");

CREATE INDEX IF NOT EXISTS "group_members_group_joined_idx"
ON "group_members" ("group_id", "joined_at" DESC);

CREATE INDEX IF NOT EXISTS "spots_user_status_idx"
ON "spots" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "posts_profile_scope_visibility_created_idx"
ON "posts" ("scope", "hidden_on_profile", "profile_user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "posts_profile_visible_created_partial_idx"
ON "posts" ("profile_user_id", "created_at" DESC)
WHERE "scope" = 'profile' AND "hidden_on_profile" = false;

CREATE INDEX IF NOT EXISTS "in_app_notifications_post_liked_cleanup_idx"
ON "in_app_notifications" ("type", (("data"->>'postId')), (("data"->>'actorUserId')))
WHERE "type" = 'post_liked';

CREATE INDEX IF NOT EXISTS "in_app_notifications_actor_user_idx"
ON "in_app_notifications" ((("data"->>'actorUserId')));
