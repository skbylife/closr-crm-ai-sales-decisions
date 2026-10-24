-- Intelligence Agent: 扩展 intel_signals 字段
-- 用于 Intelligence Agent 写入的自动扫描情报

-- 1. 给 intel 表加信号类型字段（如果表存在）
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'intel') THEN
    ALTER TABLE intel ADD COLUMN IF NOT EXISTS signal_type TEXT;
    ALTER TABLE intel ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
    ALTER TABLE intel ADD COLUMN IF NOT EXISTS triggered_by TEXT DEFAULT 'manual';
    ALTER TABLE intel ADD COLUMN IF NOT EXISTS source_url TEXT;
    ALTER TABLE intel ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    ALTER TABLE intel ADD COLUMN IF NOT EXISTS actioned_at TIMESTAMPTZ;
  END IF;
END
$$;

-- 2. 兜底：如果 intel 表不存在，创建完整表结构
CREATE TABLE IF NOT EXISTS intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID,
  contact_id UUID,
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  signal_type TEXT,
  priority TEXT DEFAULT 'medium',
  triggered_by TEXT DEFAULT 'manual',
  source_url TEXT,
  expires_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 索引：按 user_id + priority 查询快
CREATE INDEX IF NOT EXISTS idx_intel_user_priority
  ON intel (user_id, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intel_contact_created
  ON intel (contact_id, created_at DESC);
