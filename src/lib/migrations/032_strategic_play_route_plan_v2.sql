-- Strategic Play 2.0 Route Plan: formal goal-to-steps route contract.
-- The main object remains strategic_plays. These additive columns persist the
-- route rationale needed to revise steps after evidence, signals, and outcomes.

ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS situation_layers jsonb DEFAULT '[]'::jsonb;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS confidence_profile jsonb DEFAULT '{}'::jsonb;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS win_gaps jsonb DEFAULT '[]'::jsonb;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS next_verification_point text;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS play_versions jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN strategic_plays.situation_layers IS 'Strategic Play 2.0: six situation layers used as route-planning factors, not a standalone dashboard.';
COMMENT ON COLUMN strategic_plays.confidence_profile IS 'Strategic Play 2.0: evidence-quality driven confidence profile for the current route.';
COMMENT ON COLUMN strategic_plays.win_gaps IS 'Strategic Play 2.0: goal-blocking gaps each next move is intended to close or verify.';
COMMENT ON COLUMN strategic_plays.next_verification_point IS 'Strategic Play 2.0: the most important next test for the current route.';
COMMENT ON COLUMN strategic_plays.play_versions IS 'Strategic Play 2.0: user-readable route diff records triggered by signals, execution outcomes, or manual edits.';

CREATE INDEX IF NOT EXISTS idx_strategic_plays_win_gaps_gin ON strategic_plays USING gin (win_gaps);
CREATE INDEX IF NOT EXISTS idx_strategic_plays_play_versions_gin ON strategic_plays USING gin (play_versions);
