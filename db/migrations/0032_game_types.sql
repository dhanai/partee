-- 1. Create game_types table
CREATE TABLE IF NOT EXISTS "game_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "title" text NOT NULL,
  "subtitle" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "min_players" integer DEFAULT 2 NOT NULL,
  "max_players" integer DEFAULT 8 NOT NULL,
  "holes_options" jsonb DEFAULT '[9,18]'::jsonb NOT NULL,
  "scoring_mode" text NOT NULL,
  "standings_mode" text NOT NULL,
  "has_teams" boolean DEFAULT false NOT NULL,
  "team_formation" text,
  "settings_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "default_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- 2. Seed with existing game types
INSERT INTO "game_types" ("slug", "title", "subtitle", "description", "enabled", "sort_order", "min_players", "max_players", "holes_options", "scoring_mode", "standings_mode", "has_teams", "team_formation", "settings_schema", "default_settings")
VALUES
  ('skins', 'Skins', 'Tap who shot lowest — one takes the skin; two+ tied and it carries.',
   'Each hole is worth one skin. The player with the lowest score on a hole wins the skin. If two or more players tie for the lowest score, the skin carries over to the next hole (or washes, depending on your settings). At the end, the player with the most skins wins.',
   true, 0, 2, 8, '[9,18]'::jsonb,
   'pick_lowest', 'skins_count', false, null,
   '[{"key":"skinsTieHandling","label":"Tie handling","type":"select","options":["carry","wash"],"default":"carry"}]'::jsonb,
   '{"skinsTieHandling":"carry"}'::jsonb),

  ('wolf', 'Wolf', 'Rotating wolf picks a partner or goes lone each hole.',
   'Players rotate as the Wolf each hole. After everyone tees off, the Wolf chooses a partner for that hole or goes Lone Wolf. Wolf + partner play against the other two as a team. If the Wolf''s side wins, they each earn 2 points. If the other side wins, they each earn 3. Lone Wolf earns 3 points for a win, but the other three earn 3 each if the Lone Wolf loses.',
   true, 1, 4, 4, '[9,18]'::jsonb,
   'wolf_pick', 'wolf_points', true, 'wolf_rotation',
   '[{"key":"wolfTeeOff","label":"Wolf tees off","type":"select","options":["first","last"],"default":"first"},{"key":"wolfTieHandling","label":"Tie handling","type":"select","options":["carry","wash"],"default":"carry"}]'::jsonb,
   '{"wolfTeeOff":"first","wolfTieHandling":"carry"}'::jsonb),

  ('best_ball', 'Best ball', 'Team low ball per hole — coming soon.',
   'Each team takes the best individual score on every hole. Lowest team total wins.',
   false, 2, 2, 8, '[9,18]'::jsonb,
   'pick_lowest', 'low_total', true, 'fixed',
   '[]'::jsonb, '{}'::jsonb),

  ('nassau', 'Nassau', 'Front, back, and total — coming soon.',
   'Three separate bets: front nine, back nine, and overall 18. Win each independently.',
   false, 3, 2, 8, '[9,18]'::jsonb,
   'enter_strokes', 'low_total', false, null,
   '[]'::jsonb, '{}'::jsonb)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- 3. Migrate game_sessions.game_type from enum to text
ALTER TABLE "game_sessions" ALTER COLUMN "game_type" TYPE text USING "game_type"::text;
