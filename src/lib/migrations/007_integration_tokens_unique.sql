-- 为 integration_tokens 添加 connection_id UNIQUE 约束
-- 每个 connection 只保留一条 token 记录，便于 upsert
-- 幂等：IF NOT EXISTS

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'integration_tokens_connection_id_key'
  ) THEN
    -- 先清理可能的重复数据
    DELETE FROM integration_tokens a
    USING integration_tokens b
    WHERE a.id < b.id AND a.connection_id = b.connection_id;

    ALTER TABLE integration_tokens
      ADD CONSTRAINT integration_tokens_connection_id_key UNIQUE (connection_id);
  END IF;
END $$;
