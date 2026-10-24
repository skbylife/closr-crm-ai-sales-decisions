-- Play V2: 增强做局引擎 — 动量、假设、学习、复盘、关联关系
-- 幂等迁移 (IF NOT EXISTS / IF NOT EXISTS column checks)

-- ─── ALTER strategic_plays ───────────────────────────────────────────

ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS momentum text DEFAULT 'active';
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS success_criteria text;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS assumptions jsonb DEFAULT '[]'::jsonb;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS learnings jsonb DEFAULT '[]'::jsonb;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS review jsonb;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS last_step_at timestamptz;
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS days_since_progress integer DEFAULT 0;

-- confidence 可能已存在（原表有），确保存在
ALTER TABLE strategic_plays ADD COLUMN IF NOT EXISTS confidence numeric DEFAULT 0;

-- ─── CREATE play_relationships ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS play_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_play_id uuid NOT NULL REFERENCES strategic_plays(id) ON DELETE CASCADE,
  target_play_id uuid NOT NULL REFERENCES strategic_plays(id) ON DELETE CASCADE,
  relationship text NOT NULL CHECK (relationship IN ('supports', 'depends_on', 'conflicts')),
  note text,
  created_at timestamptz DEFAULT now(),

  -- 防止重复关联
  UNIQUE (source_play_id, target_play_id, relationship)
);

-- ─── Indexes ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_play_relationships_source ON play_relationships(source_play_id);
CREATE INDEX IF NOT EXISTS idx_play_relationships_target ON play_relationships(target_play_id);
CREATE INDEX IF NOT EXISTS idx_play_relationships_org ON play_relationships(org_id);
CREATE INDEX IF NOT EXISTS idx_strategic_plays_momentum ON strategic_plays(momentum);
CREATE INDEX IF NOT EXISTS idx_strategic_plays_last_step ON strategic_plays(last_step_at);

-- ─── RLS ─────────────────────────────────────────────────────────────

ALTER TABLE play_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "play_relationships_org_isolation"
  ON play_relationships
  FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
