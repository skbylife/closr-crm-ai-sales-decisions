-- 010: 企业微信数据存储表
-- 外部联系人同步记录 + 客户群

-- 企业微信外部联系人同步记录
CREATE TABLE IF NOT EXISTS integration_wecom_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  external_userid text NOT NULL,
  name text NOT NULL,
  corp_name text,
  corp_full_name text,
  position text,
  avatar text,
  -- 跟进信息
  follow_userid text,
  follow_remark text,
  follow_description text,
  add_time timestamptz,
  tags text[] DEFAULT '{}',
  -- 关联
  account_id uuid,
  contact_id uuid,
  -- 元数据
  raw_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, external_userid)
);

-- 企业微信客户群
CREATE TABLE IF NOT EXISTS integration_wecom_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  name text,
  owner_userid text,
  create_time timestamptz,
  member_count integer DEFAULT 0,
  external_member_count integer DEFAULT 0,
  member_list jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_wecom_contacts_org ON integration_wecom_contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_wecom_contacts_account ON integration_wecom_contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_wecom_contacts_contact ON integration_wecom_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_wecom_groups_org ON integration_wecom_groups(org_id);
