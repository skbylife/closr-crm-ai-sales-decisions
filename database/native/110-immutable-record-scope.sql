-- Tenant ownership is immutable through the application, including privileged
-- service writes. Moving a parent alone would invalidate existing child scopes.
-- Cross-tenant migrations require a separate, explicit operator data migration.
CREATE OR REPLACE FUNCTION public.native_protect_record_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE before_row jsonb; after_row jsonb; browser_request boolean;
        field_name text; target_user text; target_org text;
BEGIN
 before_row=to_jsonb(OLD); after_row=to_jsonb(NEW);
 browser_request=current_setting('role',true)='closr_app';
 FOREACH field_name IN ARRAY ARRAY['org_id','tenant_id'] LOOP
  IF after_row ? field_name AND after_row->>field_name IS DISTINCT FROM before_row->>field_name THEN
   RAISE EXCEPTION 'Record tenant cannot be changed through the application' USING ERRCODE='42501';
  END IF;
 END LOOP;
 IF after_row ? 'user_id' AND after_row->>'user_id' IS DISTINCT FROM before_row->>'user_id' THEN
  IF browser_request OR TG_TABLE_NAME IN ('user_settings','contact_profiles_v2','outreach_logs','org_memberships') THEN
   RAISE EXCEPTION 'Record user identity requires the authorized ownership workflow' USING ERRCODE='42501';
  END IF;
 END IF;
 IF browser_request AND after_row ? 'owner_id'
   AND after_row->>'owner_id' IS DISTINCT FROM before_row->>'owner_id' THEN
  RAISE EXCEPTION 'Record owner requires the authorized ownership workflow' USING ERRCODE='42501';
 END IF;
 -- The existing server-side account handoff may update creator/owner/assignee
 -- fields within its organization. It may not assign a foreign-tenant identity.
 target_org=after_row->>'org_id';
 IF target_org IS NOT NULL THEN
  FOREACH field_name IN ARRAY ARRAY['user_id','owner_id','assigned_to'] LOOP
   target_user=after_row->>field_name;
   IF target_user IS NOT NULL AND target_user IS DISTINCT FROM before_row->>field_name
     AND NOT EXISTS (SELECT 1 FROM public.org_memberships m
       WHERE m.org_id::text=target_org AND m.user_id::text=target_user) THEN
    RAISE EXCEPTION 'New record owner is not a member of the organization' USING ERRCODE='23503';
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.native_protect_record_scope() FROM PUBLIC;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT DISTINCT c.table_name FROM information_schema.columns c
  JOIN information_schema.tables tab ON tab.table_schema=c.table_schema AND tab.table_name=c.table_name
  WHERE c.table_schema='public' AND tab.table_type='BASE TABLE'
    AND c.column_name IN ('org_id','tenant_id','user_id','owner_id') LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS native_immutable_record_scope ON public.%I',t.table_name);
  EXECUTE format('CREATE TRIGGER native_immutable_record_scope BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.native_protect_record_scope()',t.table_name);
 END LOOP;
END $$;

-- Invitation creation, role assignment, token rotation, acceptance and revocation
-- must go through the existing checked server workflows. Generic browser writes
-- cannot bypass the API rule that only an owner may invite another admin.
REVOKE INSERT,UPDATE,DELETE ON public.org_invitations FROM closr_app;
DROP POLICY IF EXISTS native_insert ON public.org_invitations;
DROP POLICY IF EXISTS native_update ON public.org_invitations;
DROP POLICY IF EXISTS native_delete ON public.org_invitations;
