-- 017: Fix knowledge_base RLS to enforce org_id isolation
-- Previous policy (016_missing_rls.sql) only checked auth.uid() IS NOT NULL,
-- which allowed any authenticated user to read all organizations' knowledge.

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_base_authenticated" ON knowledge_base;
DROP POLICY IF EXISTS "knowledge_base_org_isolation" ON knowledge_base;

-- Org-scoped access: user can only see knowledge from orgs they belong to.
-- Backwards-compatible: rows with org_id IS NULL (legacy global knowledge) are visible to all authenticated users.
CREATE POLICY "knowledge_base_org_isolation" ON knowledge_base FOR ALL
  USING (
    org_id IS NULL
    OR org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IS NULL
    OR org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "knowledge_base_service_bypass" ON knowledge_base;
CREATE POLICY "knowledge_base_service_bypass" ON knowledge_base FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
