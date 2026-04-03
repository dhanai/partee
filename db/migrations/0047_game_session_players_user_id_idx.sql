-- Profile activity: list completed games by player user_id
CREATE INDEX IF NOT EXISTS "game_session_players_user_id_idx" ON "game_session_players" USING btree ("user_id");
