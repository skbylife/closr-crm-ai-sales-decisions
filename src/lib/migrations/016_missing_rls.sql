-- 016_missing_rls.sql
-- Enable RLS + org-isolation policies for 15 unprotected tables.
-- Idempotent: DROP POLICY IF EXISTS before CREATE POLICY; ALTER TABLE .. ENABLE is a no-op if already on.

-- Helper: every table also gets a service-role bypass so admin/cron jobs still work.

-- ────────────────────────────────────────────────────────────────────
-- 1. org_wide_defaults (has org_id)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE org_wide_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_wide_defaults_org_isolation" ON org_wide_defaults;
CREATE POLICY "org_wide_defaults_org_isolation" ON org_wide_defaults FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "org_wide_defaults_service_bypass" ON org_wide_defaults;
CREATE POLICY "org_wide_defaults_service_bypass" ON org_wide_defaults FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 2. record_shares (has org_id)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE record_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "record_shares_org_isolation" ON record_shares;
CREATE POLICY "record_shares_org_isolation" ON record_shares FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "record_shares_service_bypass" ON record_shares;
CREATE POLICY "record_shares_service_bypass" ON record_shares FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 3. ownership_transfers (has org_id)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE ownership_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ownership_transfers_org_isolation" ON ownership_transfers;
CREATE POLICY "ownership_transfers_org_isolation" ON ownership_transfers FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "ownership_transfers_service_bypass" ON ownership_transfers;
CREATE POLICY "ownership_transfers_service_bypass" ON ownership_transfers FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 4. pool_rules (has org_id)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE pool_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pool_rules_org_isolation" ON pool_rules;
CREATE POLICY "pool_rules_org_isolation" ON pool_rules FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "pool_rules_service_bypass" ON pool_rules;
CREATE POLICY "pool_rules_service_bypass" ON pool_rules FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 5. audit_log (has org_id)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_org_isolation" ON audit_log;
CREATE POLICY "audit_log_org_isolation" ON audit_log FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "audit_log_service_bypass" ON audit_log;
CREATE POLICY "audit_log_service_bypass" ON audit_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 6. quotas (has org_id)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotas_org_isolation" ON quotas;
CREATE POLICY "quotas_org_isolation" ON quotas FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "quotas_service_bypass" ON quotas;
CREATE POLICY "quotas_service_bypass" ON quotas FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 7. forecasts (has org_id)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE forecasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "forecasts_org_isolation" ON forecasts;
CREATE POLICY "forecasts_org_isolation" ON forecasts FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "forecasts_service_bypass" ON forecasts;
CREATE POLICY "forecasts_service_bypass" ON forecasts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 8. products (has org_id)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_org_isolation" ON products;
CREATE POLICY "products_org_isolation" ON products FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "products_service_bypass" ON products;
CREATE POLICY "products_service_bypass" ON products FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 9. quotes (has org_id)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotes_org_isolation" ON quotes;
CREATE POLICY "quotes_org_isolation" ON quotes FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "quotes_service_bypass" ON quotes;
CREATE POLICY "quotes_service_bypass" ON quotes FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 10. quote_items (NO org_id — join through quotes)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_org_isolation" ON quote_items;
CREATE POLICY "quote_items_org_isolation" ON quote_items FOR ALL
  USING (
    quote_id IN (
      SELECT q.id FROM quotes q
      WHERE q.org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    quote_id IN (
      SELECT q.id FROM quotes q
      WHERE q.org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "quote_items_service_bypass" ON quote_items;
CREATE POLICY "quote_items_service_bypass" ON quote_items FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 11. meeting_recordings (has org_id)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE meeting_recordings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting_recordings_org_isolation" ON meeting_recordings;
CREATE POLICY "meeting_recordings_org_isolation" ON meeting_recordings FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "meeting_recordings_service_bypass" ON meeting_recordings;
CREATE POLICY "meeting_recordings_service_bypass" ON meeting_recordings FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 12. knowledge_base (NO org_id — authenticated-only access)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_base_authenticated" ON knowledge_base;
CREATE POLICY "knowledge_base_authenticated" ON knowledge_base FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "knowledge_base_service_bypass" ON knowledge_base;
CREATE POLICY "knowledge_base_service_bypass" ON knowledge_base FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 13. source_records (has org_id)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE source_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "source_records_org_isolation" ON source_records;
CREATE POLICY "source_records_org_isolation" ON source_records FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "source_records_service_bypass" ON source_records;
CREATE POLICY "source_records_service_bypass" ON source_records FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 14. account_memory_snapshots (has org_id)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE account_memory_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_memory_snapshots_org_isolation" ON account_memory_snapshots;
CREATE POLICY "account_memory_snapshots_org_isolation" ON account_memory_snapshots FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "account_memory_snapshots_service_bypass" ON account_memory_snapshots;
CREATE POLICY "account_memory_snapshots_service_bypass" ON account_memory_snapshots FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ────────────────────────────────────────────────────────────────────
-- 15. memory_conflicts (has org_id)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE memory_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memory_conflicts_org_isolation" ON memory_conflicts;
CREATE POLICY "memory_conflicts_org_isolation" ON memory_conflicts FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "memory_conflicts_service_bypass" ON memory_conflicts;
CREATE POLICY "memory_conflicts_service_bypass" ON memory_conflicts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
