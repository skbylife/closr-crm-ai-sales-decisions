-- Engine persistence is reached through authenticated server APIs, not the
-- generic browser CRUD transport. Keep its derived records server-only.
REVOKE ALL ON public.engine_source_records,public.engine_evidence_refs,
 public.engine_judgments,public.engine_win_gaps,public.engine_moves,
 public.engine_audit_events FROM closr_app;

CREATE OR REPLACE FUNCTION public.native_validate_engine_parent_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE parent_tenant text;
BEGIN
 IF TG_TABLE_NAME='engine_evidence_refs' THEN
  SELECT tenant_id INTO parent_tenant FROM public.engine_source_records WHERE id=NEW.source_record_id;
 ELSIF TG_TABLE_NAME='engine_moves' THEN
  IF NEW.win_gap_id IS NULL THEN RETURN NEW; END IF;
  SELECT tenant_id INTO parent_tenant FROM public.engine_win_gaps WHERE id=NEW.win_gap_id;
 ELSE RAISE EXCEPTION 'Unsupported engine parent relationship'; END IF;
 IF parent_tenant IS DISTINCT FROM NEW.tenant_id THEN
  RAISE EXCEPTION 'Engine parent belongs to a different tenant' USING ERRCODE='23503';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS native_engine_parent_tenant ON public.engine_evidence_refs;
CREATE TRIGGER native_engine_parent_tenant BEFORE INSERT OR UPDATE ON public.engine_evidence_refs
 FOR EACH ROW EXECUTE FUNCTION public.native_validate_engine_parent_tenant();
DROP TRIGGER IF EXISTS native_engine_parent_tenant ON public.engine_moves;
CREATE TRIGGER native_engine_parent_tenant BEFORE INSERT OR UPDATE ON public.engine_moves
 FOR EACH ROW EXECUTE FUNCTION public.native_validate_engine_parent_tenant();
