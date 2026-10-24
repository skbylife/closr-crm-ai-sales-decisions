-- Ensure production audit log RLS is enabled even when older migration runners
-- skipped or reordered 016_missing_rls.sql.

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_org_isolation" ON audit_log;
CREATE POLICY "audit_log_org_isolation" ON audit_log FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "audit_log_service_bypass" ON audit_log;
CREATE POLICY "audit_log_service_bypass" ON audit_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
