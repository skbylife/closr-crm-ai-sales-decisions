-- ═══════════════════════════════════════════════════════════════════════
-- Migration 018: Contact Role Inference + Intel Agent Enrichment
-- ═══════════════════════════════════════════════════════════════════════
-- Additive only. All IF NOT EXISTS.

-- ─── 1. New columns on contacts ──────────────────────────────────────

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS job_level integer;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS role_confidence numeric(5,2);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS role_updated_at timestamptz;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS role_source text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enrichment_status text DEFAULT 'pending';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enrichment_sources jsonb DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enriched_at timestamptz;

COMMENT ON COLUMN contacts.job_level IS 'Seniority: 0=IC, 1=Manager, 2=Director, 3=VP, 4=CxO';
COMMENT ON COLUMN contacts.role_confidence IS 'AI confidence in role field (0-1). NULL=manual';
COMMENT ON COLUMN contacts.role_source IS 'Who set role: manual|decode_infer|intel_agent|agent_tool';
COMMENT ON COLUMN contacts.enrichment_status IS 'pending|enriched|failed|stale';

-- ─── 2. opportunity_contacts junction table ──────────────────────────

CREATE TABLE IF NOT EXISTS opportunity_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id  text NOT NULL,
  contact_id      text NOT NULL,
  deal_role       text NOT NULL,
  confidence      numeric(5,2) DEFAULT 0.5,
  source          text NOT NULL DEFAULT 'manual',
  evidence        text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Unique constraint: one role per contact per deal (per org)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_opp_contact_role'
  ) THEN
    ALTER TABLE opportunity_contacts
      ADD CONSTRAINT uq_opp_contact_role
      UNIQUE(org_id, opportunity_id, contact_id, deal_role);
  END IF;
END $$;

-- ─── 3. contact_enrichment_log audit table ───────────────────────────

CREATE TABLE IF NOT EXISTS contact_enrichment_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id    text NOT NULL,
  action        text NOT NULL,
  field_name    text NOT NULL,
  old_value     text,
  new_value     text NOT NULL,
  confidence    numeric(5,2),
  source        text NOT NULL,
  source_id     text,
  evidence      text,
  created_by    uuid,
  created_at    timestamptz DEFAULT now()
);

-- ─── 4. intel_items writeback tracking columns ───────────────────────

ALTER TABLE intel_items ADD COLUMN IF NOT EXISTS writeback_status text;
ALTER TABLE intel_items ADD COLUMN IF NOT EXISTS writeback_at timestamptz;
ALTER TABLE intel_items ADD COLUMN IF NOT EXISTS writeback_fields jsonb;

-- ─── 5. Indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_contacts_enrichment_status
  ON contacts(org_id, enrichment_status)
  WHERE enrichment_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_contacts_role_confidence
  ON contacts(org_id, role, role_confidence);

CREATE INDEX IF NOT EXISTS idx_contacts_job_level
  ON contacts(org_id, job_level)
  WHERE job_level IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opp_contacts_opportunity
  ON opportunity_contacts(org_id, opportunity_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_opp_contacts_contact
  ON opportunity_contacts(org_id, contact_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_opp_contacts_deal_role
  ON opportunity_contacts(org_id, deal_role)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_enrichment_log_contact
  ON contact_enrichment_log(org_id, contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrichment_log_source
  ON contact_enrichment_log(org_id, source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intel_writeback_pending
  ON intel_items(org_id, writeback_status)
  WHERE writeback_status = 'pending';

-- ─── 6. RLS ─────────────────────────────────────────────────────────

ALTER TABLE opportunity_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'opportunity_contacts_org_rls') THEN
    CREATE POLICY "opportunity_contacts_org_rls" ON opportunity_contacts FOR ALL
      USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
  END IF;
END $$;

ALTER TABLE contact_enrichment_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'contact_enrichment_log_org_rls') THEN
    CREATE POLICY "contact_enrichment_log_org_rls" ON contact_enrichment_log FOR ALL
      USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
  END IF;
END $$;
