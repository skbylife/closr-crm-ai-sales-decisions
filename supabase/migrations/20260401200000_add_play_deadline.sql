-- 为 strategic_plays 添加截止日期和时间节点字段
-- Fresh local resets may run this before the migration that creates strategic_plays.
-- Keep this migration idempotent and non-blocking; the create/schema migration
-- also adds these columns once strategic_plays exists.
DO $$
BEGIN
  IF to_regclass('public.strategic_plays') IS NOT NULL THEN
    ALTER TABLE strategic_plays
      ADD COLUMN IF NOT EXISTS deadline timestamptz,
      ADD COLUMN IF NOT EXISTS key_milestones jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;
