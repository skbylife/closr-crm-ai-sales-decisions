-- CRM P1 Import Governance: batch import, dedupe, merge decisions, and data quality queues.
-- Additive only. Existing CSV import endpoints can keep working while this
-- layer records the decisions that make imported CRM facts auditable.

CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  object_type text NOT NULL CHECK (object_type IN ('accounts', 'contacts')),
  source_filename text,
  status text NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed', 'published', 'failed')),
  row_count integer NOT NULL DEFAULT 0,
  create_count integer NOT NULL DEFAULT 0,
  update_count integer NOT NULL DEFAULT 0,
  conflict_count integer NOT NULL DEFAULT 0,
  skip_count integer NOT NULL DEFAULT 0,
  finding_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  source_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapped_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  planned_action text NOT NULL CHECK (planned_action IN ('create', 'update', 'skip', 'conflict')),
  result_status text NOT NULL DEFAULT 'pending' CHECK (result_status IN ('pending', 'created', 'updated', 'skipped', 'failed')),
  result_entity_type text,
  result_entity_id uuid,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(import_job_id, row_index)
);

CREATE TABLE IF NOT EXISTS field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  object_type text NOT NULL CHECK (object_type IN ('accounts', 'contacts')),
  closr_field text NOT NULL,
  source_field text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(import_job_id, closr_field)
);

CREATE TABLE IF NOT EXISTS duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  import_row_index integer NOT NULL,
  imported_name text NOT NULL,
  existing_entity_type text NOT NULL CHECK (existing_entity_type IN ('account', 'contact')),
  existing_entity_id uuid,
  existing_name text NOT NULL,
  match_type text NOT NULL CHECK (match_type IN ('name', 'email', 'website')),
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium')),
  recommendation text NOT NULL CHECK (recommendation IN ('merge', 'review')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merge_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  import_row_index integer NOT NULL,
  decision text NOT NULL CHECK (decision IN ('merge', 'skip', 'keep_both', 'defer')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  rationale text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS data_quality_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  import_job_id uuid REFERENCES import_jobs(id) ON DELETE CASCADE,
  import_row_index integer,
  entity_type text,
  entity_id uuid,
  field text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  label text NOT NULL,
  detail text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_org_created ON import_jobs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_rows_job ON import_rows(import_job_id, row_index);
CREATE INDEX IF NOT EXISTS idx_field_mappings_job ON field_mappings(import_job_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_job ON duplicate_candidates(import_job_id);
CREATE INDEX IF NOT EXISTS idx_merge_decisions_job ON merge_decisions(import_job_id);
CREATE INDEX IF NOT EXISTS idx_data_quality_findings_org_status ON data_quality_findings(org_id, status, created_at DESC);

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplicate_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE merge_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_quality_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_jobs_org_isolation" ON import_jobs;
CREATE POLICY "import_jobs_org_isolation" ON import_jobs FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "import_rows_org_isolation" ON import_rows;
CREATE POLICY "import_rows_org_isolation" ON import_rows FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "field_mappings_org_isolation" ON field_mappings;
CREATE POLICY "field_mappings_org_isolation" ON field_mappings FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "duplicate_candidates_org_isolation" ON duplicate_candidates;
CREATE POLICY "duplicate_candidates_org_isolation" ON duplicate_candidates FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "merge_decisions_org_isolation" ON merge_decisions;
CREATE POLICY "merge_decisions_org_isolation" ON merge_decisions FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "data_quality_findings_org_isolation" ON data_quality_findings;
CREATE POLICY "data_quality_findings_org_isolation" ON data_quality_findings FOR ALL
  USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
