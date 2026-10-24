/**
 * Execute migration 20260418000000_database_fixes.sql via direct PostgreSQL.
 * Runs each statement individually, gracefully skipping non-existent tables.
 */

import { readFileSync } from 'fs';
import pg from 'pg';

// Load .env.local
const envFile = readFileSync('.env.local', 'utf8');
for (const line of envFile.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connStr) { console.error('❌ Missing DATABASE_URL'); process.exit(1); }

const pool = new pg.Pool({
  connectionString: connStr,
  ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 2,
});

// Define migration steps explicitly for control
const steps = [
  // Phase 1: Type Mismatches
  { label: 'quotes.opportunity_id uuid→text', sql: `ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_opportunity_id_fkey` },
  { label: 'quotes.opportunity_id type', sql: `ALTER TABLE quotes ALTER COLUMN opportunity_id TYPE text USING opportunity_id::text` },
  { label: 'quotes.account_id uuid→text', sql: `ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_account_id_fkey` },
  { label: 'quotes.account_id type', sql: `ALTER TABLE quotes ALTER COLUMN account_id TYPE text USING account_id::text` },
  { label: 'quotes FK opportunity_id', sql: `ALTER TABLE quotes ADD CONSTRAINT quotes_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL` },
  { label: 'quotes FK account_id', sql: `ALTER TABLE quotes ADD CONSTRAINT quotes_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL` },

  // Comments & knowledge_base — may not exist yet, wrap safely
  { label: 'comments.entity_id uuid→text', sql: `DO $$ BEGIN ALTER TABLE comments ALTER COLUMN entity_id TYPE text USING entity_id::text; EXCEPTION WHEN undefined_table THEN NULL; END $$`, optional: true },
  { label: 'comments RLS fix (drop old)', sql: `DO $$ BEGIN DROP POLICY IF EXISTS "comments_select_org" ON comments; DROP POLICY IF EXISTS "comments_insert_org" ON comments; EXCEPTION WHEN undefined_table THEN NULL; END $$`, optional: true },
  { label: 'comments RLS fix (create new)', sql: `DO $$ BEGIN
    CREATE POLICY "comments_select_org" ON comments FOR SELECT USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
    EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$`, optional: true },
  { label: 'comments RLS fix (insert policy)', sql: `DO $$ BEGIN
    CREATE POLICY "comments_insert_org" ON comments FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()) AND user_id = auth.uid());
    EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$`, optional: true },
  { label: 'knowledge_base.org_id text→uuid', sql: `DO $$ BEGIN ALTER TABLE knowledge_base ALTER COLUMN org_id TYPE uuid USING org_id::uuid; EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; END $$`, optional: true },

  // Phase 3: FK constraints
  { label: 'FK discovery_notes.opportunity_id', sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'discovery_notes_opportunity_id_fkey') THEN ALTER TABLE discovery_notes ADD CONSTRAINT discovery_notes_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL; END IF; END $$` },
  { label: 'FK intel_items.opportunity_id', sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'intel_items_opportunity_id_fkey') THEN ALTER TABLE intel_items ADD CONSTRAINT intel_items_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL; END IF; END $$` },
  { label: 'FK composed_emails.opportunity_id', sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'composed_emails_opportunity_id_fkey') THEN ALTER TABLE composed_emails ADD CONSTRAINT composed_emails_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL; END IF; END $$` },
  { label: 'FK composed_emails.contact_id', sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'composed_emails_contact_id_fkey') THEN ALTER TABLE composed_emails ADD CONSTRAINT composed_emails_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL; END IF; END $$` },
  { label: 'FK email_decodes.opportunity_id', sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'email_decodes_opportunity_id_fkey') THEN ALTER TABLE email_decodes ADD CONSTRAINT email_decodes_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL; END IF; END $$` },
  { label: 'FK tasks.account_id', sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tasks_account_id_fkey') THEN ALTER TABLE tasks ADD CONSTRAINT tasks_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL; END IF; END $$` },
  { label: 'FK tasks.opportunity_id', sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tasks_opportunity_id_fkey') THEN ALTER TABLE tasks ADD CONSTRAINT tasks_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL; END IF; END $$` },
  { label: 'FK tasks.contact_id', sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tasks_contact_id_fkey') THEN ALTER TABLE tasks ADD CONSTRAINT tasks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL; END IF; END $$` },

  // Phase 4: Indexes
  { label: 'IDX opportunities(stage)', sql: `CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(org_id, stage)` },
  { label: 'IDX activity_logs(entity)', sql: `CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id, created_at DESC)` },
  { label: 'IDX ai_insights(updated_at)', sql: `DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_ai_insights_updated_at ON ai_insights(updated_at); EXCEPTION WHEN undefined_table THEN NULL; END $$`, optional: true },
  { label: 'IDX tasks(status)', sql: `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(org_id, status)` },
  { label: 'IDX tasks(due_date)', sql: `CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(org_id, due_date)` },
  { label: 'IDX intel_items(opportunity_id)', sql: `CREATE INDEX IF NOT EXISTS idx_intel_items_opportunity_id ON intel_items(opportunity_id)` },
  { label: 'IDX composed_emails(opportunity_id)', sql: `CREATE INDEX IF NOT EXISTS idx_composed_emails_opportunity_id ON composed_emails(opportunity_id)` },
  { label: 'IDX email_decodes(opportunity_id)', sql: `CREATE INDEX IF NOT EXISTS idx_email_decodes_opportunity_id ON email_decodes(opportunity_id)` },

  // Phase 5: RLS for tables missing policies
  { label: 'RLS knowledge_base', sql: `DO $$ BEGIN
    ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "knowledge_base_rls" ON knowledge_base;
    CREATE POLICY "knowledge_base_rls" ON knowledge_base FOR ALL USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()) OR (org_id IS NULL AND user_id = auth.uid())) WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()) OR (org_id IS NULL AND user_id = auth.uid()));
    EXCEPTION WHEN undefined_table THEN NULL; END $$`, optional: true },

  { label: 'RLS ai_insights', sql: `DO $$ BEGIN
    ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "ai_insights_rls" ON ai_insights;
    CREATE POLICY "ai_insights_rls" ON ai_insights FOR ALL USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())) WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
    EXCEPTION WHEN undefined_table THEN NULL; END $$`, optional: true },

  { label: 'RLS products', sql: `DO $$ BEGIN
    ALTER TABLE products ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "products_rls" ON products;
    CREATE POLICY "products_rls" ON products FOR ALL USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())) WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
    EXCEPTION WHEN undefined_table THEN NULL; END $$`, optional: true },

  { label: 'RLS quotes', sql: `DO $$ BEGIN
    ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "quotes_rls" ON quotes;
    CREATE POLICY "quotes_rls" ON quotes FOR ALL USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())) WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
    EXCEPTION WHEN undefined_table THEN NULL; END $$`, optional: true },

  { label: 'RLS quote_items', sql: `DO $$ BEGIN
    ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "quote_items_rls" ON quote_items;
    CREATE POLICY "quote_items_rls" ON quote_items FOR ALL USING (quote_id IN (SELECT id FROM quotes WHERE org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))) WITH CHECK (quote_id IN (SELECT id FROM quotes WHERE org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())));
    EXCEPTION WHEN undefined_table THEN NULL; END $$`, optional: true },

  // Phase 6: Remove dead columns
  { label: 'DROP gemini_key', sql: `ALTER TABLE user_settings DROP COLUMN IF EXISTS gemini_key` },
  { label: 'DROP last_activity_at', sql: `ALTER TABLE accounts DROP COLUMN IF EXISTS last_activity_at` },

  // Phase 7: Date type improvements
  { label: 'expected_close_date text→date', sql: `ALTER TABLE opportunities ALTER COLUMN expected_close_date TYPE date USING CASE WHEN expected_close_date IS NULL THEN NULL WHEN expected_close_date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN expected_close_date::date ELSE NULL END` },
  { label: 'won_date text→date', sql: `ALTER TABLE opportunities ALTER COLUMN won_date TYPE date USING CASE WHEN won_date IS NULL THEN NULL WHEN won_date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN won_date::date ELSE NULL END` },

  // Cleanup function
  { label: 'sync_logs cleanup function', sql: `CREATE OR REPLACE FUNCTION cleanup_old_sync_logs() RETURNS void AS $fn$ BEGIN DELETE FROM sync_logs WHERE created_at < now() - interval '90 days'; EXCEPTION WHEN undefined_table THEN NULL; END; $fn$ LANGUAGE plpgsql` },
];

console.log('🚀 开始执行迁移\n');

const client = await pool.connect();
let success = 0;
let skipped = 0;
let failed = 0;

try {
  await client.query('BEGIN');

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const sp = `sp_${i}`;
    try {
      await client.query(`SAVEPOINT ${sp}`);
      await client.query(step.sql);
      await client.query(`RELEASE SAVEPOINT ${sp}`);
      console.log(`  ✅ ${step.label}`);
      success++;
    } catch (err) {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      const msg = err.message || '';
      if (msg.includes('already exists') || msg.includes('does not exist') || step.optional) {
        console.log(`  ⏭️  ${step.label} — 跳过 (${msg.slice(0, 50)})`);
        skipped++;
      } else {
        console.log(`  ❌ ${step.label}`);
        console.log(`     ${msg}`);
        failed++;
        throw err;
      }
    }
  }

  await client.query('COMMIT');
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ 迁移完成: ${success} 成功, ${skipped} 跳过, ${failed} 失败`);
} catch (err) {
  await client.query('ROLLBACK');
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`❌ 迁移回滚: ${err.message}`);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
