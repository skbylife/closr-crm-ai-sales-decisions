-- Integration tables for connector management, OAuth tokens, sync state, emails, audit logs, notifications
-- 幂等：全部使用 IF NOT EXISTS

-- 连接配置
CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  connector_id text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  config jsonb NOT NULL DEFAULT '{}',
  instance_url text,
  scopes text[],
  connected_at timestamptz,
  connected_by uuid,
  last_sync_at timestamptz,
  sync_status text DEFAULT 'idle',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, connector_id)
);

-- OAuth tokens（加密存储）
CREATE TABLE IF NOT EXISTS integration_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  expires_at timestamptz NOT NULL,
  token_type text DEFAULT 'Bearer',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 同步状态
CREATE TABLE IF NOT EXISTS integration_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  object_type text NOT NULL,
  last_sync_at timestamptz,
  cursor jsonb DEFAULT '{}',
  record_count integer DEFAULT 0,
  status text DEFAULT 'idle',
  error_message text,
  UNIQUE(connection_id, object_type)
);

-- 同步的邮件记录
CREATE TABLE IF NOT EXISTS integration_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  sender text NOT NULL,
  to_recipients text[] DEFAULT '{}',
  cc_recipients text[] DEFAULT '{}',
  subject text,
  received_at timestamptz NOT NULL,
  synced_from text,
  visible_to text[] DEFAULT '{}',
  -- AI 分析结果
  summary text,
  sentiment text,
  intent text,
  key_info jsonb DEFAULT '[]',
  -- 关联
  account_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, message_id)
);

-- 审计日志
CREATE TABLE IF NOT EXISTS integration_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid,
  connection_id uuid,
  connector_id text NOT NULL,
  action text NOT NULL,
  object_type text,
  record_count integer,
  details jsonb,
  status text NOT NULL,
  error_message text,
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);

-- Agent 通知
CREATE TABLE IF NOT EXISTS agent_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid,
  type text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  body text,
  actions jsonb DEFAULT '[]',
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_integration_connections_org ON integration_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_integration_emails_org ON integration_emails(org_id);
CREATE INDEX IF NOT EXISTS idx_integration_emails_message_id ON integration_emails(org_id, message_id);
CREATE INDEX IF NOT EXISTS idx_integration_emails_account ON integration_emails(account_id);
CREATE INDEX IF NOT EXISTS idx_integration_emails_contact ON integration_emails(contact_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_time ON integration_audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_notifications_user ON agent_notifications(org_id, user_id, read);
