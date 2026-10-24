-- Strategic Play Schema v1: 企业销售推进计划结构收口
-- 说明：现有 strategic_plays 表没有通用 metadata/json 字段可安全承载全局判断字段；
-- 因此添加最小 nullable/text-jsonb 字段，保持旧 steps / goal_description / success_criteria 兼容。

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
