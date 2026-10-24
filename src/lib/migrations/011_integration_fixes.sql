-- 011: Integration 修复
-- M7: integration_tokens 加 org_id 列
-- M12: integration_emails 加索引

-- M7: 添加 org_id 列（用于 RLS）
ALTER TABLE integration_tokens ADD COLUMN IF NOT EXISTS org_id uuid;

-- 回填 org_id from integration_connections
UPDATE integration_tokens t SET org_id = c.org_id
FROM integration_connections c WHERE t.connection_id = c.id AND t.org_id IS NULL;

-- M12: 邮件查询索引
CREATE INDEX IF NOT EXISTS idx_integration_emails_received
  ON integration_emails(org_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_emails_account_time
  ON integration_emails(account_id, received_at DESC);
