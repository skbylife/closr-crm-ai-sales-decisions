-- Closr Judgment Engine Enterprise P0 core persistence.
-- Additive-only tables for the Closr derivative product. Existing Closr CRM/SaaS
-- tables remain source-of-truth for business records; engine_* stores derived
-- judgment/evidence/move/audit state only.

CREATE TABLE IF NOT EXISTS engine_source_records (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('email', 'meeting', 'call', 'chat', 'rfp', 'crm_note', 'document', 'news', 'task', 'outcome')),
  external_source_id text,
  account_id text,
  opportunity_id text,
  contact_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  occurred_at timestamptz NOT NULL,
  author_side text CHECK (author_side IN ('customer', 'seller', 'partner', 'external', 'unknown')),
  author_name text,
  author_email text,
  content text,
  content_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS engine_evidence_refs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  source_record_id text NOT NULL REFERENCES engine_source_records(id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (evidence_type IN ('support', 'counter', 'missing', 'context')),
  quote text NOT NULL,
  summary text NOT NULL,
  quality_score numeric NOT NULL DEFAULT 0,
  freshness_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS engine_judgments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  account_id text NOT NULL,
  opportunity_id text,
  dimension text NOT NULL,
  answer text NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'accepted', 'challenged', 'revised', 'invalidated', 'confirmed')),
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  impact text NOT NULL CHECK (impact IN ('low', 'medium', 'high', 'critical')),
  support_evidence_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  counter_evidence_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  missing_evidence text[] NOT NULL DEFAULT ARRAY[]::text[],
  rationale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS engine_win_gaps (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  account_id text NOT NULL,
  opportunity_id text,
  dimension text NOT NULL,
  current_state text NOT NULL,
  desired_state text NOT NULL,
  impact text NOT NULL,
  linked_judgment_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence_gap text NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'addressed', 'invalidated', 'accepted_risk')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS engine_moves (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  account_id text NOT NULL,
  opportunity_id text,
  win_gap_id text NOT NULL REFERENCES engine_win_gaps(id) ON DELETE CASCADE,
  intent text NOT NULL,
  target_person text NOT NULL,
  ask text NOT NULL,
  expected_judgment_delta text NOT NULL,
  success_test text NOT NULL,
  failure_test text NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'approved', 'in_progress', 'done', 'failed', 'skipped')),
  approval_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS engine_audit_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  actor_id text,
  actor_type text NOT NULL DEFAULT 'engine' CHECK (actor_type IN ('user', 'service', 'engine', 'connector')),
  event_type text NOT NULL,
  object_type text NOT NULL,
  object_id text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engine_source_records_tenant_account ON engine_source_records(tenant_id, account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_source_records_tenant_opportunity ON engine_source_records(tenant_id, opportunity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_evidence_refs_source ON engine_evidence_refs(source_record_id);
CREATE INDEX IF NOT EXISTS idx_engine_judgments_tenant_account ON engine_judgments(tenant_id, account_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_win_gaps_tenant_account ON engine_win_gaps(tenant_id, account_id, status);
CREATE INDEX IF NOT EXISTS idx_engine_moves_gap ON engine_moves(win_gap_id);
CREATE INDEX IF NOT EXISTS idx_engine_audit_events_tenant_created ON engine_audit_events(tenant_id, created_at DESC);

ALTER TABLE engine_source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_evidence_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_judgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_win_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_audit_events ENABLE ROW LEVEL SECURITY;

-- The packaged engine uses service credentials in customer-hosted mode. RLS is
-- enabled now so customer-specific policies can be added without changing data
-- shape when the derivative product is split into its own deployment package.
