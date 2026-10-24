-- General readable knowledge is distinct from customer/account knowledge.
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS is_general_knowledge boolean NOT NULL DEFAULT false;
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS content_sha256 text;
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS embedding_model text;
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS embedding_dimensions integer;
ALTER TABLE public.strategy_cases ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.strategy_cases ADD COLUMN IF NOT EXISTS is_general_knowledge boolean NOT NULL DEFAULT false;
ALTER TABLE public.strategy_cases ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.strategy_cases ADD COLUMN IF NOT EXISTS content_sha256 text;
ALTER TABLE public.strategy_cases ADD COLUMN IF NOT EXISTS embedding_model text;
ALTER TABLE public.strategy_cases ADD COLUMN IF NOT EXISTS embedding_dimensions integer;
ALTER TABLE public.contact_profiles_v2 ADD COLUMN IF NOT EXISTS embedding_model text;
ALTER TABLE public.contact_profiles_v2 ADD COLUMN IF NOT EXISTS embedding_dimensions integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='knowledge_general_scope') THEN
    ALTER TABLE public.knowledge_base ADD CONSTRAINT knowledge_general_scope
      CHECK (NOT is_general_knowledge OR (org_id IS NULL AND account_id IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='knowledge_embedding_metadata') THEN
    ALTER TABLE public.knowledge_base ADD CONSTRAINT knowledge_embedding_metadata
      CHECK (embedding IS NULL OR (embedding_model IS NOT NULL AND length(embedding_model)>0 AND embedding_dimensions=1536));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='case_general_scope') THEN
    ALTER TABLE public.strategy_cases ADD CONSTRAINT case_general_scope CHECK (NOT is_general_knowledge OR org_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='case_embedding_metadata') THEN
    ALTER TABLE public.strategy_cases ADD CONSTRAINT case_embedding_metadata
      CHECK (embedding IS NULL OR (embedding_model IS NOT NULL AND length(embedding_model)>0 AND embedding_dimensions=1536));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS knowledge_general_idx ON public.knowledge_base(is_general_knowledge) WHERE is_general_knowledge;
-- Only an authenticated request may read the approved global corpus. Writes still require
-- the native service/operator path; clients cannot label their own rows as general.
DROP POLICY IF EXISTS native_general_knowledge_read ON public.knowledge_base;
CREATE POLICY native_general_knowledge_read ON public.knowledge_base FOR SELECT TO closr_app
  USING (auth.uid() IS NOT NULL AND is_general_knowledge AND org_id IS NULL AND account_id IS NULL);

DROP POLICY IF EXISTS native_general_case_read ON public.strategy_cases;
CREATE POLICY native_general_case_read ON public.strategy_cases FOR SELECT TO closr_app
 USING (auth.uid() IS NOT NULL AND is_general_knowledge AND org_id IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS native_knowledge_source_unique ON public.knowledge_base(org_id,source_type,source_id);
GRANT SELECT ON public.strategy_cases TO closr_app;
