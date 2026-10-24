-- Fix knowledge_base RLS policies to prevent anonymous/public access.
-- Service role keeps the normal Supabase BYPASSRLS behavior; no service policy is required.

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_base_org_isolation" ON public.knowledge_base;
DROP POLICY IF EXISTS "knowledge_base_rls" ON public.knowledge_base;
DROP POLICY IF EXISTS "knowledge_base_authenticated" ON public.knowledge_base;
DROP POLICY IF EXISTS "knowledge_base_service_bypass" ON public.knowledge_base;
DROP POLICY IF EXISTS "knowledge_base_select_authenticated" ON public.knowledge_base;
DROP POLICY IF EXISTS "knowledge_base_insert_authenticated" ON public.knowledge_base;
DROP POLICY IF EXISTS "knowledge_base_update_authenticated" ON public.knowledge_base;
DROP POLICY IF EXISTS "knowledge_base_delete_authenticated" ON public.knowledge_base;

DO $$
DECLARE
  org_id_type text;
  has_user_id boolean;
  org_match text;
  personal_match text;
  visibility_check text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO org_id_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.knowledge_base'::regclass
    AND a.attname = 'org_id'
    AND NOT a.attisdropped;

  SELECT EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = 'public.knowledge_base'::regclass
      AND a.attname = 'user_id'
      AND NOT a.attisdropped
  ) INTO has_user_id;

  IF org_id_type = 'uuid' THEN
    org_match := 'org_id IN (SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid())';
  ELSE
    org_match := 'org_id IS NOT NULL AND org_id ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' AND org_id::uuid IN (SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid())';
  END IF;

  IF has_user_id THEN
    personal_match := 'org_id IS NULL AND user_id = auth.uid()';
  ELSE
    -- Current production schema has no user_id column, so org-less rows must not be exposed via client roles.
    personal_match := 'false';
  END IF;

  visibility_check := format('(%s) OR (%s)', org_match, personal_match);

  EXECUTE format(
    'CREATE POLICY "knowledge_base_select_authenticated" ON public.knowledge_base FOR SELECT TO authenticated USING (%s)',
    visibility_check
  );

  EXECUTE format(
    'CREATE POLICY "knowledge_base_insert_authenticated" ON public.knowledge_base FOR INSERT TO authenticated WITH CHECK (%s)',
    visibility_check
  );

  EXECUTE format(
    'CREATE POLICY "knowledge_base_update_authenticated" ON public.knowledge_base FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
    visibility_check,
    visibility_check
  );

  EXECUTE format(
    'CREATE POLICY "knowledge_base_delete_authenticated" ON public.knowledge_base FOR DELETE TO authenticated USING (%s)',
    visibility_check
  );
END $$;
