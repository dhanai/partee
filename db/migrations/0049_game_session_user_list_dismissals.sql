-- Per-user removal from "My games" list only; does not delete the session for others.
CREATE TABLE game_session_user_list_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);

CREATE INDEX game_session_user_list_dismissals_user_idx ON game_session_user_list_dismissals (user_id);
