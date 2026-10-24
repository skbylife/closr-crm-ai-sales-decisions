-- 004_permissions_and_ownership.sql
-- Phase 1: 权限与数据所有权

-- 1. accounts 添加 owner_id 和 visibility
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'org' CHECK (visibility IN ('private', 'team', 'org'));

-- 2. opportunities 确保 assigned_to 存在（已有）并添加 visibility
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'org' CHECK (visibility IN ('private', 'team', 'org'));

-- 3. intel_items 添加 created_by
ALTER TABLE intel_items ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. email_decodes 添加 user_id（谁做的解读）
ALTER TABLE email_decodes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. 创建索引加速权限查询
CREATE INDEX IF NOT EXISTS idx_accounts_owner_id ON accounts(owner_id);
CREATE INDEX IF NOT EXISTS idx_accounts_visibility ON accounts(visibility);
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned_to ON opportunities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_opportunities_visibility ON opportunities(visibility);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);

-- 6. 更新现有数据：demo 用户拥有所有客户（仅当 owner_id 为空时）
-- 这一步需要在 seed 里做，不在迁移里硬编码 user_id
