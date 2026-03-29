-- Insert 7 new game types and update nassau

INSERT INTO game_types (slug, title, subtitle, description, enabled, sort_order, min_players, max_players, holes_options, scoring_mode, standings_mode, has_teams, team_formation, settings_schema, default_settings)
VALUES
(
  'sixes', 'Sixes', 'Rotate 2v2 partners every 6 holes.',
  'Four players pair off and change partners every six holes. Holes 1–6: A & B vs C & D. Holes 7–12: A & C vs B & D. Holes 13–18: A & D vs B & C. Each six-hole segment is a separate match using best ball. The winner is whoever is on the winning side of at least two segments.',
  true, 4, 4, 4, '[9, 18]'::jsonb,
  'enter_strokes', 'sixes_segments', true, 'rotating_sixes',
  '[]'::jsonb, '{}'::jsonb
),
(
  'match', 'Match Play', 'Hole-by-hole — lowest score wins the hole.',
  'Players compare scores on each hole. The player with the lowest score wins the hole. If scores are tied, the hole is halved. A match ends when one player leads by more holes than remain. Results are shown as "3 & 2" (3 up with 2 to play).',
  true, 5, 2, 4, '[9, 18]'::jsonb,
  'enter_strokes', 'match_play', false, null,
  '[]'::jsonb, '{}'::jsonb
),
(
  'vegas', 'Vegas', '2v2 — combine scores into a two-digit number.',
  'Four players split into two teams of two. Each team combines their individual hole scores into a two-digit number with the lower score first (e.g., a 4 and a 5 becomes 45). The difference between team numbers is the point swing. If a team makes a birdie, the losing team''s digits flip (5-4 becomes 54 instead of 45).',
  true, 6, 4, 4, '[9, 18]'::jsonb,
  'enter_strokes', 'vegas_combined', true, 'fixed',
  '[{"key":"vegasBirdieFlip","label":"Birdie flips","type":"toggle","default":true}]'::jsonb,
  '{"vegasBirdieFlip":true}'::jsonb
),
(
  'dots', 'Dots', 'Earn points for achievements each hole.',
  'Players earn "dots" (points) for specific achievements during the round — birdies, greenies, sandies, chip-ins, one-putts, and more. Penalties like three-putts or double bogeys lose dots. The player with the most dots at the end wins. Agree on which achievements count before teeing off.',
  true, 7, 2, 8, '[9, 18]'::jsonb,
  'enter_dots', 'dots_total', false, null,
  '[]'::jsonb, '{}'::jsonb
),
(
  'rolling_stroke', 'Rolling Stroke', 'Stroke play with running totals.',
  'Standard stroke play where each player enters their score per hole. The player with the lowest total strokes at the end wins. Simple and straightforward — great for tracking scores alongside any other game.',
  true, 8, 2, 8, '[9, 18]'::jsonb,
  'enter_strokes', 'low_total', false, null,
  '[]'::jsonb, '{}'::jsonb
),
(
  'points', 'Points', 'Stableford scoring — highest points wins.',
  'Players earn points based on their score relative to par on each hole. Double bogey or worse = 0 pts, bogey = 1 pt, par = 2 pts, birdie = 3 pts, eagle = 4 pts, albatross = 5 pts. The player with the highest total points wins. Bad holes can''t ruin your round since the worst you score is zero.',
  true, 9, 2, 8, '[9, 18]'::jsonb,
  'enter_strokes', 'stableford_points', false, null,
  '[{"key":"coursePar","label":"Course par per hole","type":"select","options":["3","4","5"],"default":"4"}]'::jsonb,
  '{"coursePar":"4"}'::jsonb
),
(
  'targets', 'Targets', 'Pick a stat and track it hole-by-hole.',
  'Players pick a target category — fairways hit, greens in regulation, pars or better, or birdies. Each hole, mark whether you hit the target. The player with the most hits at the end wins. Great for focusing on a specific part of your game rather than overall score.',
  true, 10, 2, 8, '[9, 18]'::jsonb,
  'enter_targets', 'targets_count', false, null,
  '[{"key":"targetCategory","label":"Target category","type":"select","options":["fairways","greens","pars","birdies"],"default":"pars"}]'::jsonb,
  '{"targetCategory":"pars"}'::jsonb
);

-- Update nassau: enable it, add description and proper standings mode
UPDATE game_types
SET
  enabled = true,
  description = 'Three separate matches in one round: front nine (holes 1–9), back nine (holes 10–18), and overall 18. Each segment is scored as match play — lowest score wins the hole. Win two out of three to take the Nassau. A classic format that keeps the competition alive even if you lose the front.',
  standings_mode = 'nassau_match',
  sort_order = 3,
  updated_at = now()
WHERE slug = 'nassau';
