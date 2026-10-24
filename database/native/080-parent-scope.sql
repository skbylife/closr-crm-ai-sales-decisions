-- A tenant id on a junction row is not sufficient: every referenced parent must
-- belong to that tenant. Otherwise trusted server-side joins could expose a
-- different tenant's parent through an attacker-created link.
CREATE OR REPLACE FUNCTION public.native_validate_parent_scopes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE mapping jsonb; relation record; child jsonb; previous jsonb; parent jsonb;
        child_org text; parent_org text; parent_id text; changed boolean;
        browser_request boolean; accessible boolean;
BEGIN
 mapping=TG_ARGV[0]::jsonb;
 child=to_jsonb(NEW);
 previous=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 child_org=child->>'org_id';
 browser_request=current_setting('role',true)='closr_app';
 FOR relation IN SELECT key AS child_column,value #>> '{}' AS parent_table FROM jsonb_each(mapping) LOOP
  parent_id=child->>relation.child_column;
  IF parent_id IS NULL OR parent_id='' THEN CONTINUE; END IF;
  changed=TG_OP='INSERT' OR previous->>relation.child_column IS DISTINCT FROM parent_id
    OR previous->>'org_id' IS DISTINCT FROM child_org;
  IF NOT changed THEN CONTINUE; END IF;
  EXECUTE format('SELECT to_jsonb(p) FROM public.%I p WHERE p.id::text=$1',relation.parent_table)
    INTO parent USING parent_id;
  IF parent IS NULL THEN RAISE EXCEPTION 'Referenced parent does not exist' USING ERRCODE='23503'; END IF;
  parent_org=parent->>'org_id';
  IF parent_org IS DISTINCT FROM child_org THEN
    RAISE EXCEPTION 'Referenced parent belongs to a different organization' USING ERRCODE='23503';
  END IF;
  IF browser_request THEN
   accessible=false;
   IF child_org IS NULL THEN
    accessible=(parent->>'user_id')=auth.uid()::text;
   ELSIF relation.parent_table='accounts' THEN
    accessible=public.native_can_access_owner(child_org::uuid,COALESCE(parent->>'owner_id',parent->>'user_id')::uuid);
   ELSIF relation.parent_table='tasks' AND parent->>'assigned_to'=auth.uid()::text THEN
    accessible=public.native_is_org_member(child_org::uuid);
   ELSIF parent->>'account_id' IS NOT NULL THEN
    accessible=public.native_can_access_account(parent->>'account_id',child_org::uuid);
   ELSIF parent->>'user_id' IS NOT NULL THEN
    accessible=public.native_can_access_owner(child_org::uuid,(parent->>'user_id')::uuid);
   ELSE
    accessible=public.native_is_org_member(child_org::uuid);
   END IF;
   IF accessible IS NOT TRUE THEN
    RAISE EXCEPTION 'Referenced parent is outside the current user scope' USING ERRCODE='42501';
   END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.native_validate_parent_scopes() FROM PUBLIC;

DO $$ DECLARE child record; col record; parent_name text; mapping jsonb;
BEGIN
 FOR child IN SELECT t.tablename FROM pg_tables t
   WHERE t.schemaname='public' AND EXISTS (
    SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public'
      AND c.table_name=t.tablename AND c.column_name='org_id') LOOP
  mapping='{}'::jsonb;
  -- Retain actual FK targets, including uncommon relationship/junction columns.
  FOR col IN SELECT ca.attname AS child_column,p.relname AS parent_table
   FROM pg_constraint fk JOIN pg_class p ON p.oid=fk.confrelid
   JOIN pg_namespace pn ON pn.oid=p.relnamespace
   CROSS JOIN LATERAL unnest(fk.conkey,fk.confkey) keys(child_att,parent_att)
   JOIN pg_attribute ca ON ca.attrelid=fk.conrelid AND ca.attnum=keys.child_att
   JOIN pg_attribute pa ON pa.attrelid=fk.confrelid AND pa.attnum=keys.parent_att
   WHERE fk.contype='f' AND fk.conrelid=('public.'||quote_ident(child.tablename))::regclass
    AND pn.nspname='public' AND ca.attname<>'org_id' AND pa.attname='id'
    AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=p.oid AND a.attname='org_id' AND NOT a.attisdropped)
  LOOP mapping=mapping||jsonb_build_object(col.child_column,col.parent_table); END LOOP;
  -- Some historical schema columns had no FK. Guard the standard app relationships too.
  FOR col IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=child.tablename LOOP
   parent_name=CASE col.column_name
     WHEN 'account_id' THEN 'accounts' WHEN 'contact_id' THEN 'contacts'
     WHEN 'opportunity_id' THEN 'opportunities' WHEN 'task_id' THEN 'tasks'
     WHEN 'strategic_play_id' THEN 'strategic_plays' WHEN 'source_play_id' THEN 'strategic_plays'
     WHEN 'target_play_id' THEN 'strategic_plays' WHEN 'rfp_id' THEN 'rfps'
     WHEN 'pursuit_team_id' THEN 'pursuit_teams' WHEN 'artifact_id' THEN 'pallas_artifacts'
     WHEN 'proposal_id' THEN 'pallas_action_proposals' ELSE NULL END;
   IF parent_name IS NOT NULL AND NOT mapping ? col.column_name THEN
     mapping=mapping||jsonb_build_object(col.column_name,parent_name);
   END IF;
  END LOOP;
  IF mapping='{}'::jsonb THEN CONTINUE; END IF;
  EXECUTE format('DROP TRIGGER IF EXISTS native_parent_scope ON public.%I',child.tablename);
  EXECUTE format('CREATE TRIGGER native_parent_scope BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.native_validate_parent_scopes(%L)',child.tablename,mapping::text);
 END LOOP;
END $$;
