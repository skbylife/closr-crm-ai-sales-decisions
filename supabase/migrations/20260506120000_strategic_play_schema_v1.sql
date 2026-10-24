-- Strategic Play Schema v1: 企业销售推进计划结构收口
-- Mirrors src/lib/migrations/025_strategic_play_schema_v1.sql for CI/CD execution.
-- Fresh Supabase resets do not run src/lib/migrations/002_strategic_plays.sql,
-- so ensure the base table exists before applying v1 columns.

CREATE TABLE IF NOT EXISTS strategic_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  account_id text REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  opportunity_id text,
  target_contact_id text,
  goal_type text NOT NULL,
  goal_description text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]',
  alternative_paths jsonb DEFAULT '[]',
  confidence numeric(5,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  ai_model text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS relationship_strength integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_strategic_plays_org_id ON strategic_plays(org_id);
CREATE INDEX IF NOT EXISTS idx_strategic_plays_account_id ON strategic_plays(account_id);
CREATE INDEX IF NOT EXISTS idx_strategic_plays_status ON strategic_plays(status) WHERE status IN ('active', 'in_progress');

ALTER TABLE strategic_plays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "strategic_plays_rls" ON strategic_plays;
CREATE POLICY "strategic_plays_rls" ON strategic_plays FOR ALL
  USING (
    org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
    OR (org_id IS NULL AND user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
    OR (org_id IS NULL AND user_id = auth.uid())
  );

ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS deadline timestamptz;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS key_milestones jsonb DEFAULT '[]'::jsonb;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS situation_judgment text;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS strategic_objective text;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS stakeholder_path jsonb DEFAULT '[]'::jsonb;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS evidence_basis jsonb DEFAULT '[]'::jsonb;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS risk_counter_evidence jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN strategic_plays.deadline IS 'Strategic Play deadline / 截止日期';
COMMENT ON COLUMN strategic_plays.key_milestones IS 'Strategic Play key milestones / 时间节点';
COMMENT ON COLUMN strategic_plays.situation_judgment IS 'Strategic Play Schema v1: 局势判断';
COMMENT ON COLUMN strategic_plays.strategic_objective IS 'Strategic Play Schema v1: 战略目标';
COMMENT ON COLUMN strategic_plays.stakeholder_path IS 'Strategic Play Schema v1: 关键人路径（数组）';
COMMENT ON COLUMN strategic_plays.evidence_basis IS 'Strategic Play Schema v1: 证据依据（数组）';
COMMENT ON COLUMN strategic_plays.risk_counter_evidence IS 'Strategic Play Schema v1: 反证/风险证据（数组）';

CREATE INDEX IF NOT EXISTS idx_strategic_plays_opportunity_id ON strategic_plays(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_strategic_plays_user_id ON strategic_plays(user_id);
