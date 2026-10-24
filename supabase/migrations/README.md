# Closr Database Migrations

## Running Migrations

Execute the migration files **in numerical order** against your Supabase/PostgreSQL database:

```bash
psql $DATABASE_URL -f supabase/migrations/001_initial_schema.sql
psql $DATABASE_URL -f supabase/migrations/002_business_tables.sql
psql $DATABASE_URL -f supabase/migrations/003_indexes.sql
psql $DATABASE_URL -f supabase/migrations/004_rls_policies.sql
psql $DATABASE_URL -f supabase/migrations/005_activity_logs.sql
psql $DATABASE_URL -f supabase/migrations/006_add_org_id.sql
psql $DATABASE_URL -f supabase/migrations/007_add_job_title.sql
```

Or run all at once:

```bash
for f in supabase/migrations/0*.sql; do psql $DATABASE_URL -f "$f"; done
```

## Idempotency

Every migration file is **idempotent and safe to re-run**:

- Tables use `CREATE TABLE IF NOT EXISTS`
- Indexes use `CREATE INDEX IF NOT EXISTS`
- RLS policies use `DROP POLICY IF EXISTS` before `CREATE POLICY`
- Column additions use `ADD COLUMN IF NOT EXISTS`
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is inherently idempotent

## Migration Files

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Organizations, teams, org_memberships, and org_invitations tables |
| `002_business_tables.sql` | All business data tables: accounts, contacts, opportunities, intel_items, email_decodes, composed_emails, meeting_preps, discovery_notes, knowledge_items, user_settings, tasks |
| `003_indexes.sql` | All indexes: foreign key lookups, org_id tenant isolation, user_id backward-compat |
| `004_rls_policies.sql` | Row Level Security policies for all tables (org-based isolation with user_id fallback) |
| `005_activity_logs.sql` | Activity logs table with indexes and admin/owner-only RLS policy |
| `006_add_org_id.sql` | Adds org_id column to business tables for existing databases migrating to multi-tenant |
| `007_add_job_title.sql` | Adds job_title column to org_memberships |

## Notes

- Migrations 001-005 cover a fresh database setup.
- Migration 006 is for **existing databases** that need the org_id column added to pre-existing business tables.
- Migration 007 adds the job_title field for admin-managed role titles.
- All business data RLS policies include a `(org_id IS NULL AND user_id = auth.uid())` fallback so unmigrated rows remain accessible to their original owner.
