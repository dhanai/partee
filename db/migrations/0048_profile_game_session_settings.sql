-- Per-user visibility and pin order for completed games on profile activity.
CREATE TABLE profile_game_session_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  hidden_on_profile boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);

CREATE INDEX profile_game_session_settings_user_idx ON profile_game_session_settings (user_id);
