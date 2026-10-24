-- C1: Enable RLS and add org_id isolation policies for tables missing RLS.
-- Fresh local resets may not have every optional table yet, so each table is guarded.

DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'quotas',
    'forecasts',
    'org_wide_defaults',
    'record_shares',
    'ownership_transfers',
    'pool_rules',
    'audit_log',
    'products',
    'quotes',
    'meeting_recordings'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      policy_name := table_name || '_org_isolation';
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, table_name);
      EXECUTE format(
        'CREATE POLICY %I ON %I USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))',
        policy_name,
        table_name
      );
    END IF;
  END LOOP;
END $$;

-- quote_items has no org_id; isolate via parent quotes table when both exist.
DO $$
BEGIN
  IF to_regclass('public.quote_items') IS NOT NULL AND to_regclass('public.quotes') IS NOT NULL THEN
    ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "quote_items_org_isolation" ON quote_items;
    CREATE POLICY "quote_items_org_isolation" ON quote_items
      USING (quote_id IN (
        SELECT id FROM quotes
        WHERE org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
      ));
  END IF;
END $$;

-- knowledge_base may exist by this point; allow shared NULL org rows and org-scoped rows.
DO $$
BEGIN
  IF to_regclass('public.knowledge_base') IS NOT NULL THEN
    ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "knowledge_base_org_isolation" ON knowledge_base;
    CREATE POLICY "knowledge_base_org_isolation" ON knowledge_base
      USING (
        org_id IS NULL
        OR org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
      );
  END IF;
END $$;
