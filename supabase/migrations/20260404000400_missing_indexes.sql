-- P0: 缺失索引补齐 — 加速关键查询路径
CREATE INDEX IF NOT EXISTS idx_email_decodes_matched_contact_id ON email_decodes(matched_contact_id);
CREATE INDEX IF NOT EXISTS idx_ai_advices_org_id ON ai_advices(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_advices_user_id ON ai_advices(user_id);

-- Fresh local resets may run before strategic_plays exists. The strategic play
-- schema migration also creates/keeps these indexes once the table exists.
DO $$
BEGIN
  IF to_regclass('public.strategic_plays') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_strategic_plays_opportunity_id ON strategic_plays(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_strategic_plays_user_id ON strategic_plays(user_id);
  END IF;
END $$;
