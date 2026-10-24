-- Migration 002: Strategic Plays (做局引擎)
-- 在 Supabase SQL Editor 手动执行

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

-- 添加 relationship_strength 到 contacts（如果不存在）
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS relationship_strength integer DEFAULT 0;

-- 索引
CREATE INDEX IF NOT EXISTS idx_strategic_plays_org_id ON strategic_plays(org_id);
CREATE INDEX IF NOT EXISTS idx_strategic_plays_account_id ON strategic_plays(account_id);
CREATE INDEX IF NOT EXISTS idx_strategic_plays_status ON strategic_plays(status) WHERE status IN ('active', 'in_progress');

-- RLS
ALTER TABLE strategic_plays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strategic_plays_rls" ON strategic_plays FOR ALL
  USING (
    org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
    OR (org_id IS NULL AND user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
    OR (org_id IS NULL AND user_id = auth.uid())
  );
