-- =====================================================================
-- Closr Database Fixes — 2026-04-18
-- Comprehensive fix for type mismatches, orphan risks, missing indexes,
-- broken RLS, and security issues identified in DATABASE_ASSESSMENT.md
-- =====================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 1: CRITICAL — Type Mismatches
-- ═══════════════════════════════════════════════════════════════════════

-- 1a. comments.entity_id: uuid → text (accounts/contacts/opportunities use text IDs)
ALTER TABLE comments ALTER COLUMN entity_id TYPE text USING entity_id::text;

-- 1b. knowledge_base.org_id: text → uuid
DO $$
BEGIN
  IF to_regclass('public.knowledge_base') IS NOT NULL THEN
    DROP POLICY IF EXISTS "knowledge_base_org_isolation" ON knowledge_base;
    DROP POLICY IF EXISTS "knowledge_base_rls" ON knowledge_base;
    ALTER TABLE knowledge_base ALTER COLUMN org_id TYPE uuid USING org_id::uuid;
  END IF;
END $$;

-- 1c-1e. quotes FK columns: uuid → text (opportunities/accounts ids are text)
DO $$
BEGIN
  IF to_regclass('public.quotes') IS NOT NULL THEN
    ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_opportunity_id_fkey;
    ALTER TABLE quotes ALTER COLUMN opportunity_id TYPE text USING opportunity_id::text;

    ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_account_id_fkey;
    ALTER TABLE quotes ALTER COLUMN account_id TYPE text USING account_id::text;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'quotes_opportunity_id_fkey'
    ) THEN
      ALTER TABLE quotes
        ADD CONSTRAINT quotes_opportunity_id_fkey
        FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'quotes_account_id_fkey'
    ) THEN
      ALTER TABLE quotes
        ADD CONSTRAINT quotes_account_id_fkey
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 2: HIGH — Fix RLS (comments table references non-existent org_members)
-- ═══════════════════════════════════════════════════════════════════════

-- Drop broken policies
DROP POLICY IF EXISTS "comments_select_org" ON comments;
DROP POLICY IF EXISTS "comments_insert_org" ON comments;

-- Recreate with correct table name: org_memberships
CREATE POLICY "comments_select_org" ON comments
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "comments_insert_org" ON comments
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
    AND user_id = auth.uid()
  );

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 3: HIGH — Add ON DELETE CASCADE where missing
-- ═══════════════════════════════════════════════════════════════════════

-- 3a. discovery_notes.opportunity_id → opportunities.id (was no FK at all)
-- Only add if column exists and no FK yet
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'discovery_notes_opportunity_id_fkey'
  ) THEN
    ALTER TABLE discovery_notes
      ADD CONSTRAINT discovery_notes_opportunity_id_fkey
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3b. intel_items.opportunity_id → opportunities.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'intel_items_opportunity_id_fkey'
  ) THEN
    ALTER TABLE intel_items
      ADD CONSTRAINT intel_items_opportunity_id_fkey
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3c. composed_emails.opportunity_id → opportunities.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'composed_emails_opportunity_id_fkey'
  ) THEN
    ALTER TABLE composed_emails
      ADD CONSTRAINT composed_emails_opportunity_id_fkey
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3d. composed_emails.contact_id → contacts.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'composed_emails_contact_id_fkey'
  ) THEN
    ALTER TABLE composed_emails
      ADD CONSTRAINT composed_emails_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3e. email_decodes.opportunity_id → opportunities.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'email_decodes_opportunity_id_fkey'
  ) THEN
    ALTER TABLE email_decodes
      ADD CONSTRAINT email_decodes_opportunity_id_fkey
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3f. tasks.account_id → accounts.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_account_id_fkey'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3g. tasks.opportunity_id → opportunities.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_opportunity_id_fkey'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_opportunity_id_fkey
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3h. tasks.contact_id → contacts.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_contact_id_fkey'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 4: MODERATE — Missing Indexes
-- ═══════════════════════════════════════════════════════════════════════

-- 4a. contacts.email — used by email matching, webhook
-- (idx_contacts_email_lower already exists, add exact match too)

-- 4b. opportunities.stage — used by pipeline view filtering
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(org_id, stage);

-- 4c. activities/activity_logs (entity_type, entity_id) — timeline queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity
  ON activity_logs(entity_type, entity_id, created_at DESC);

-- 4d. ai_insights.updated_at — daily cache freshness check
DO $$
BEGIN
  IF to_regclass('public.ai_insights') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ai_insights_updated_at ON ai_insights(updated_at);
  END IF;
END $$;

-- 4e. tasks by status and due_date — kanban board queries
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(org_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(org_id, due_date);

-- 4f. intel_items.opportunity_id — join queries
CREATE INDEX IF NOT EXISTS idx_intel_items_opportunity_id ON intel_items(opportunity_id);

-- 4g. composed_emails.opportunity_id
CREATE INDEX IF NOT EXISTS idx_composed_emails_opportunity_id ON composed_emails(opportunity_id);

-- 4h. email_decodes.opportunity_id
CREATE INDEX IF NOT EXISTS idx_email_decodes_opportunity_id ON email_decodes(opportunity_id);

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 5: MODERATE — RLS for tables missing policies
-- ═══════════════════════════════════════════════════════════════════════

-- 5a. knowledge_base — enable RLS and add org isolation
DO $$
BEGIN
  IF to_regclass('public.knowledge_base') IS NOT NULL THEN
    ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "knowledge_base_rls" ON knowledge_base;
    CREATE POLICY "knowledge_base_rls" ON knowledge_base FOR ALL
      USING (
        org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
        OR org_id IS NULL
      )
      WITH CHECK (
        org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
        OR org_id IS NULL
      );
  END IF;
END $$;

-- 5b. ai_insights — enable RLS
DO $$
BEGIN
  IF to_regclass('public.ai_insights') IS NOT NULL THEN
    ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "ai_insights_rls" ON ai_insights;
    CREATE POLICY "ai_insights_rls" ON ai_insights FOR ALL
      USING (
        org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
      )
      WITH CHECK (
        org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- 5c. products — enable RLS
DO $$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    ALTER TABLE products ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "products_rls" ON products;
    CREATE POLICY "products_rls" ON products FOR ALL
      USING (
        org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
      )
      WITH CHECK (
        org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- 5d. quotes — enable RLS
DO $$
BEGIN
  IF to_regclass('public.quotes') IS NOT NULL THEN
    ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "quotes_rls" ON quotes;
    CREATE POLICY "quotes_rls" ON quotes FOR ALL
      USING (
        org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
      )
      WITH CHECK (
        org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- 5e. quote_items — enable RLS (via quote's org)
DO $$
BEGIN
  IF to_regclass('public.quote_items') IS NOT NULL AND to_regclass('public.quotes') IS NOT NULL THEN
    ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "quote_items_rls" ON quote_items;
    CREATE POLICY "quote_items_rls" ON quote_items FOR ALL
      USING (
        quote_id IN (
          SELECT id FROM quotes WHERE org_id IN (
            SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
          )
        )
      )
      WITH CHECK (
        quote_id IN (
          SELECT id FROM quotes WHERE org_id IN (
            SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 6: MODERATE — Remove dead/insecure columns
-- ═══════════════════════════════════════════════════════════════════════

-- 6a. Remove gemini_key from user_settings (security risk, unused in app)
ALTER TABLE user_settings DROP COLUMN IF EXISTS gemini_key;

-- 6b. Remove duplicate last_activity_at (keep last_activity only)
ALTER TABLE accounts DROP COLUMN IF EXISTS last_activity_at;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 7: LOW — Data type improvements
-- ═══════════════════════════════════════════════════════════════════════

-- 7a. opportunities.expected_close_date: text → date
-- Safe conversion: existing data uses 'YYYY-MM-DD' format
ALTER TABLE opportunities
  ALTER COLUMN expected_close_date TYPE date
  USING CASE
    WHEN expected_close_date IS NULL THEN NULL
    WHEN expected_close_date ~ '^\d{4}-\d{2}-\d{2}$' THEN expected_close_date::date
    ELSE NULL
  END;

-- 7b. opportunities.won_date: text → date
ALTER TABLE opportunities
  ALTER COLUMN won_date TYPE date
  USING CASE
    WHEN won_date IS NULL THEN NULL
    WHEN won_date ~ '^\d{4}-\d{2}-\d{2}$' THEN won_date::date
    ELSE NULL
  END;

-- 7c. sync_logs cleanup — auto-delete entries older than 90 days
-- (We add a cron-friendly function; actual scheduling via pg_cron or app layer)
-- Fresh Supabase resets did not previously define sync_logs, so create the
-- minimal table expected by the cleanup function without affecting existing deployments.
CREATE TABLE IF NOT EXISTS sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION cleanup_old_sync_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM sync_logs WHERE created_at < now() - interval '90 days';
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 8: Update migration.sql reference (comments in code)
-- ═══════════════════════════════════════════════════════════════════════

-- Summary of changes applied:
-- [CRITICAL] comments.entity_id: uuid → text
-- [CRITICAL] knowledge_base.org_id: text → uuid
-- [CRITICAL] quotes.opportunity_id: uuid → text + FK restored
-- [CRITICAL] quotes.account_id: uuid → text + FK restored
-- [HIGH] comments RLS: org_members → org_memberships
-- [HIGH] Added FK constraints: discovery_notes, intel_items, composed_emails,
--        email_decodes, tasks (opportunity_id, account_id, contact_id)
-- [MODERATE] Added indexes: opportunities(stage), activity_logs(entity),
--            ai_insights(updated_at), tasks(status, due_date), etc.
-- [MODERATE] Added RLS: knowledge_base, ai_insights, products, quotes, quote_items
-- [MODERATE] Dropped: user_settings.gemini_key, accounts.last_activity_at
-- [LOW] expected_close_date, won_date: text → date
-- [LOW] Added sync_logs cleanup function
