-- 015: Fix intel table missing RLS (Supabase alert: rls_disabled_in_public)
-- Mirrors supabase/migrations/20260415000000_fix_intel_rls.sql

ALTER TABLE intel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intel_user_isolation" ON intel;
CREATE POLICY "intel_user_isolation" ON intel FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
