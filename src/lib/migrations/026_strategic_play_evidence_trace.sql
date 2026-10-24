-- Strategic Play Evidence Trace: persist generation grounding and provenance
-- source_records remains the evidence/judgment event ledger; these columns store
-- the play-level model grounding metadata needed for deterministic API reads.

ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS knowledge_traces jsonb DEFAULT '[]'::jsonb;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS knowledge_gaps jsonb DEFAULT '[]'::jsonb;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS evidence_provenance jsonb;

COMMENT ON COLUMN strategic_plays.knowledge_traces IS 'Strategic Play P0-B: grounded knowledge trace refs returned by generation';
COMMENT ON COLUMN strategic_plays.knowledge_gaps IS 'Strategic Play P0-B: missing evidence / knowledge gaps returned by generation';
COMMENT ON COLUMN strategic_plays.evidence_provenance IS 'Strategic Play P0-B: play-level evidence provenance snapshot; source_records remains source-of-truth ledger';
