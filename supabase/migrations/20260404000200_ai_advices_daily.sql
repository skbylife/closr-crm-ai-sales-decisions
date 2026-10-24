-- F2: 扩展 ai_advices 表支持每日自动分析
-- 1. 添加 generated_at 字段（标记本次分析生成时间）
-- 2. 扩展 source CHECK 约束，允许 'daily_analysis'
-- 3. 添加唯一索引：每个 opportunity 每天只保留一条分析

ALTER TABLE ai_advices ADD COLUMN IF NOT EXISTS generated_at DATE;

-- 更新 source CHECK 约束（先删后建）
ALTER TABLE ai_advices DROP CONSTRAINT IF EXISTS ai_advices_source_check;
ALTER TABLE ai_advices ADD CONSTRAINT ai_advices_source_check
  CHECK (source IN ('strategy', 'intel', 'meddicc', 'daily_analysis'));

-- 每个 opportunity + 日期唯一（用于 upsert）
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_advices_opp_date
  ON ai_advices (opportunity_id, generated_at)
  WHERE opportunity_id IS NOT NULL AND generated_at IS NOT NULL;
