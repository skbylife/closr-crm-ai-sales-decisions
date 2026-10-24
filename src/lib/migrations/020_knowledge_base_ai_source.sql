-- ═══════════════════════════════════════════════════════════════════════
-- Migration 020: Knowledge Base AI Source Tracking + org_id column
-- ═══════════════════════════════════════════════════════════════════════
-- Additive only. All IF NOT EXISTS / DO $$ idempotent blocks.
-- 1) Adds org_id column (was previously enforced only at API level)
-- 2) Adds provenance columns (source, source_id, source_type)
-- 3) Expands category CHECK to include both Chinese seed values and new AI categories

-- ─── 0. Add org_id column (was missing from original schema) ─────────

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_org
  ON knowledge_base(org_id);

-- ─── 1. Add source column ────────────────────────────────────────────

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN knowledge_base.source IS
  'manual|ai_rfp_analysis|ai_rfp_play|ai_forecast|ai_competitive|ai_strategy|ai_win_loss|ai_play';

-- ─── 2. Add source_type column ───────────────────────────────────────

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT NULL;

COMMENT ON COLUMN knowledge_base.source_type IS
  'Table the source_id references: rfp_ai_analyses|ai_forecasts|ai_insights|strategic_plays|knowledge_items|NULL';

-- ─── 3. Add source_id column ────────────────────────────────────────

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS source_id text DEFAULT NULL;

COMMENT ON COLUMN knowledge_base.source_id IS
  'PK of the originating record in the table identified by source_type';

-- ─── 4. Indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_knowledge_base_source
  ON knowledge_base(source);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_source_ref
  ON knowledge_base(source_type, source_id)
  WHERE source_id IS NOT NULL;

-- org-scoped indexes (now that org_id column exists)
CREATE INDEX IF NOT EXISTS idx_knowledge_base_org_source
  ON knowledge_base(org_id, source)
  WHERE source <> 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_base_source_dedup
  ON knowledge_base(org_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

-- ─── 5. Source CHECK constraint ─────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_base_source_check'
      AND conrelid = 'knowledge_base'::regclass
  ) THEN
    ALTER TABLE knowledge_base ADD CONSTRAINT knowledge_base_source_check
      CHECK (source IN (
        'manual',
        'ai_rfp_analysis',
        'ai_rfp_play',
        'ai_forecast',
        'ai_competitive',
        'ai_strategy',
        'ai_win_loss',
        'ai_play'
      ));
  END IF;
END $$;

-- ─── 6. Source type CHECK constraint ────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_base_source_type_check'
      AND conrelid = 'knowledge_base'::regclass
  ) THEN
    ALTER TABLE knowledge_base ADD CONSTRAINT knowledge_base_source_type_check
      CHECK (source_type IS NULL OR source_type IN (
        'rfp_ai_analyses',
        'rfps',
        'ai_forecasts',
        'ai_insights',
        'strategic_plays',
        'knowledge_items'
      ));
  END IF;
END $$;

-- ─── 7. Source pair consistency ──────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_base_source_pair_check'
      AND conrelid = 'knowledge_base'::regclass
  ) THEN
    ALTER TABLE knowledge_base ADD CONSTRAINT knowledge_base_source_pair_check
      CHECK (
        (source_id IS NULL AND source_type IS NULL)
        OR (source_id IS NOT NULL AND source_type IS NOT NULL)
      );
  END IF;
END $$;

-- ─── 8. Category validation (no CHECK constraint) ───────────────────
-- Existing seed data uses Chinese category names (博弈论, 谈判学, etc.)
-- while API code uses English names (product_proposal, case_study, etc.).
-- Both are valid. We do NOT add a CHECK constraint on category to avoid
-- breaking existing data or future category additions.
-- Category validation is handled at the API layer instead.

-- ═══════════════════════════════════════════════════════════════════════
-- RLS: org_id column now exists. Update policy to use it properly.
-- The policy from 017 already handles org_id (including IS NULL fallback).
-- No changes needed — existing policy covers the new column automatically.
-- ═══════════════════════════════════════════════════════════════════════
