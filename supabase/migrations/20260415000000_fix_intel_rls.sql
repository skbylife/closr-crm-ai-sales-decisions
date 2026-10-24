-- Fix Supabase security alert: rls_disabled_in_public
-- The `intel` table (created in 20260403080000_extend_intel_signals.sql) was missing RLS.
-- This table has user_id but no org_id; policy uses user_id for isolation.
-- Note: the app uses `intel_items` (which has RLS); `intel` is a fallback/signal table
-- used by the intelligence agent scanner.

BEGIN;

-- 1. Enable RLS
ALTER TABLE intel ENABLE ROW LEVEL SECURITY;

-- 2. Policy: users can only access their own intel rows
DROP POLICY IF EXISTS "intel_user_isolation" ON intel;
CREATE POLICY "intel_user_isolation" ON intel FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Service role (used by intelligence agent scanner) bypasses RLS by default,
--    so no extra policy needed for server-side agent writes.

COMMIT;
