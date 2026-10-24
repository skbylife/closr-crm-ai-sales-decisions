-- 为 knowledge_base 表添加 account_id 和 org_id 字段（客户级知识库）
-- Fresh local resets do not include the older app-side knowledge_base migration,
-- so create a minimal table here before applying account/org columns.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_base (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  applicable_scenarios text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS account_id text REFERENCES accounts(id) ON DELETE CASCADE;

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS org_id uuid;

-- 为客户级查询建索引
CREATE INDEX IF NOT EXISTS idx_knowledge_base_account ON knowledge_base(account_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_org ON knowledge_base(org_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_title ON knowledge_base USING gin(to_tsvector('simple', title));
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content ON knowledge_base USING gin(to_tsvector('simple', content));
