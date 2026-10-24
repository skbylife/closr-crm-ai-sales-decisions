-- 011: 为所有 integration 表启用 Row Level Security
-- 幂等：policy 使用 IF NOT EXISTS (PG 15+) 或 DROP IF EXISTS + CREATE

-- ─── Enable RLS ──────────────────────────────────────────────────────

ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_wecom_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_wecom_groups ENABLE ROW LEVEL SECURITY;

-- ─── Policies ────────────────────────────────────────────────────────
-- Service role 可以全部访问（后端用 service_role key）
-- 前端用户通过 API 路由访问，API 路由已有权限检查
-- RLS 作为额外安全层

-- integration_connections: 只能看自己组织的
DROP POLICY IF EXISTS "org_isolation" ON integration_connections;
CREATE POLICY "org_isolation" ON integration_connections
  FOR ALL USING (org_id = (SELECT org_id FROM org_memberships WHERE user_id = auth.uid() LIMIT 1));

-- integration_emails: 只能看自己组织的
DROP POLICY IF EXISTS "org_isolation" ON integration_emails;
CREATE POLICY "org_isolation" ON integration_emails
  FOR ALL USING (org_id = (SELECT org_id FROM org_memberships WHERE user_id = auth.uid() LIMIT 1));

-- agent_notifications: 只能看发给自己的或全组织的
DROP POLICY IF EXISTS "user_or_org" ON agent_notifications;
CREATE POLICY "user_or_org" ON agent_notifications
  FOR ALL USING (
    org_id = (SELECT org_id FROM org_memberships WHERE user_id = auth.uid() LIMIT 1)
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- integration_tokens: 仅 service role 访问，前端不直接查询
DROP POLICY IF EXISTS "service_only" ON integration_tokens;
CREATE POLICY "service_only" ON integration_tokens FOR ALL USING (false);

-- integration_sync_state: 仅 service role 访问
DROP POLICY IF EXISTS "service_only" ON integration_sync_state;
CREATE POLICY "service_only" ON integration_sync_state FOR ALL USING (false);

-- integration_audit_logs: 只能看自己组织的
DROP POLICY IF EXISTS "org_isolation" ON integration_audit_logs;
CREATE POLICY "org_isolation" ON integration_audit_logs
  FOR ALL USING (org_id = (SELECT org_id FROM org_memberships WHERE user_id = auth.uid() LIMIT 1));

-- integration_wecom_contacts: 只能看自己组织的
DROP POLICY IF EXISTS "org_isolation" ON integration_wecom_contacts;
CREATE POLICY "org_isolation" ON integration_wecom_contacts
  FOR ALL USING (org_id = (SELECT org_id FROM org_memberships WHERE user_id = auth.uid() LIMIT 1));

-- integration_wecom_groups: 只能看自己组织的
DROP POLICY IF EXISTS "org_isolation" ON integration_wecom_groups;
CREATE POLICY "org_isolation" ON integration_wecom_groups
  FOR ALL USING (org_id = (SELECT org_id FROM org_memberships WHERE user_id = auth.uid() LIMIT 1));
