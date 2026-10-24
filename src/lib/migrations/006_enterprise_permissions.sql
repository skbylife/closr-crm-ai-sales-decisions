-- 006_enterprise_permissions.sql
-- 企业级权限系统

-- 1. org_memberships 添加汇报关系和角色层级
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS
  reports_to_user uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS
  role_level integer DEFAULT 0;
-- role_level: 0=AE, 1=Manager, 2=Director, 3=VP, 4=CxO

-- 1b. 添加 job_level 列（统一命名，兼容旧 role_level）
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS
  job_level integer DEFAULT 0;
-- job_level: 0=AE, 1=Manager, 2=Director, 3=VP, 4=CxO
-- 将已有 role_level 数据迁移到 job_level
UPDATE org_memberships SET job_level = role_level WHERE job_level = 0 AND role_level > 0;

-- 2. accounts 添加所有权追踪字段
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS
  ownership_changed_at timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS
  ownership_changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS
  last_activity_at timestamptz DEFAULT now();

-- 3. OWD 表
CREATE TABLE IF NOT EXISTS org_wide_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  object_type text NOT NULL,
  default_access text NOT NULL DEFAULT 'private'
    CHECK (default_access IN ('private', 'read_only', 'read_write', 'full')),
  UNIQUE(org_id, object_type)
);

-- 4. 手动共享表
CREATE TABLE IF NOT EXISTS record_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  object_type text NOT NULL,
  record_id uuid NOT NULL,
  shared_with_type text NOT NULL CHECK (shared_with_type IN ('user', 'team')),
  shared_with_id uuid NOT NULL,
  access_level text NOT NULL DEFAULT 'read_only' CHECK (access_level IN ('read_only', 'read_write')),
  shared_by uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  UNIQUE(org_id, object_type, record_id, shared_with_type, shared_with_id)
);

-- 5. 所有权转让记录表
CREATE TABLE IF NOT EXISTS ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  object_type text NOT NULL,
  record_id uuid NOT NULL,
  from_user uuid REFERENCES auth.users(id),
  to_user uuid REFERENCES auth.users(id),
  reason text,
  transferred_by uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 6. 公海规则表
CREATE TABLE IF NOT EXISTS pool_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  inactive_days integer DEFAULT 30,
  no_deal_days integer,
  max_accounts_per_user integer DEFAULT 50,
  cooldown_hours integer DEFAULT 24,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 7. 审计日志表
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  action text NOT NULL,
  object_type text NOT NULL,
  record_id uuid,
  record_name text,
  changes jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_shares_org ON record_shares(org_id, object_type, record_id);
CREATE INDEX IF NOT EXISTS idx_ownership_transfers_org ON ownership_transfers(org_id, created_at DESC);
