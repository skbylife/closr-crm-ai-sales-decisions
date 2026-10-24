-- 031_production_schema_rls_warnings.sql
-- Close the 2026-05-21 production schema baseline warnings for public tables
-- that still had RLS disabled in Singapore production.
--
-- This migration is intentionally narrower than 016_missing_rls.sql so it can
-- be reviewed and applied as a production hardening slice.

-- ────────────────────────────────────────────────────────────────────
-- Org-scoped enterprise / forecast tables
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS org_wide_defaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_wide_defaults_org_isolation" ON org_wide_defaults;
CREATE POLICY "org_wide_defaults_org_isolation" ON org_wide_defaults FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "org_wide_defaults_service_bypass" ON org_wide_defaults;
CREATE POLICY "org_wide_defaults_service_bypass" ON org_wide_defaults FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

ALTER TABLE IF EXISTS pool_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pool_rules_org_isolation" ON pool_rules;
CREATE POLICY "pool_rules_org_isolation" ON pool_rules FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "pool_rules_service_bypass" ON pool_rules;
CREATE POLICY "pool_rules_service_bypass" ON pool_rules FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

ALTER TABLE IF EXISTS quotas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quotas_org_isolation" ON quotas;
CREATE POLICY "quotas_org_isolation" ON quotas FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "quotas_service_bypass" ON quotas;
CREATE POLICY "quotas_service_bypass" ON quotas FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

ALTER TABLE IF EXISTS forecasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "forecasts_org_isolation" ON forecasts;
CREATE POLICY "forecasts_org_isolation" ON forecasts FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "forecasts_service_bypass" ON forecasts;
CREATE POLICY "forecasts_service_bypass" ON forecasts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

ALTER TABLE IF EXISTS record_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "record_shares_org_isolation" ON record_shares;
CREATE POLICY "record_shares_org_isolation" ON record_shares FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "record_shares_service_bypass" ON record_shares;
CREATE POLICY "record_shares_service_bypass" ON record_shares FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

ALTER TABLE IF EXISTS ownership_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ownership_transfers_org_isolation" ON ownership_transfers;
CREATE POLICY "ownership_transfers_org_isolation" ON ownership_transfers FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "ownership_transfers_service_bypass" ON ownership_transfers;
CREATE POLICY "ownership_transfers_service_bypass" ON ownership_transfers FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

ALTER TABLE IF EXISTS play_relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "play_relationships_org_isolation" ON play_relationships;
CREATE POLICY "play_relationships_org_isolation" ON play_relationships FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "play_relationships_service_bypass" ON play_relationships;
CREATE POLICY "play_relationships_service_bypass" ON play_relationships FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- Legacy / empty signal tables
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS intel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "intel_user_isolation" ON intel;
CREATE POLICY "intel_user_isolation" ON intel FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "intel_service_bypass" ON intel;
CREATE POLICY "intel_service_bypass" ON intel FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- The babel_* tables are legacy artifacts in the Closr public schema and do
-- not have org_id/user_id columns. Keep them service-only until they are either
-- archived or given a real owner model.
ALTER TABLE IF EXISTS babel_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "babel_profiles_service_only" ON babel_profiles;
CREATE POLICY "babel_profiles_service_only" ON babel_profiles FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

ALTER TABLE IF EXISTS babel_knowledge ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "babel_knowledge_service_only" ON babel_knowledge;
CREATE POLICY "babel_knowledge_service_only" ON babel_knowledge FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

ALTER TABLE IF EXISTS babel_interaction_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "babel_interaction_summaries_service_only" ON babel_interaction_summaries;
CREATE POLICY "babel_interaction_summaries_service_only" ON babel_interaction_summaries FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- knowledge_base already had RLS enabled in production but no policies. Make the
-- intended service-mediated access explicit instead of leaving an audit ambiguity.
ALTER TABLE IF EXISTS knowledge_base ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "knowledge_base_service_only" ON knowledge_base;
CREATE POLICY "knowledge_base_service_only" ON knowledge_base FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
