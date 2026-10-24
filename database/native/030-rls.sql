-- Native authorization: browser-originated queries run as closr_app with a
-- transaction-local verified identity. Never connect browsers as the schema owner.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, closr_app;

CREATE OR REPLACE FUNCTION public.native_is_org_member(target_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.org_memberships m WHERE m.org_id = target_org AND m.user_id = auth.uid()
  )
$$;
CREATE OR REPLACE FUNCTION public.native_is_org_admin(target_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.org_memberships m WHERE m.org_id = target_org AND m.user_id = auth.uid() AND m.role IN ('owner','admin')
  )
$$;
CREATE OR REPLACE FUNCTION public.native_can_access_owner(target_org uuid, record_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.org_id = target_org AND m.user_id = auth.uid()
    AND (m.role IN ('owner','admin') OR COALESCE(m.job_level,m.role_level,0) >= 2
      OR record_owner = auth.uid()
      OR (COALESCE(m.job_level,m.role_level,0) >= 1 AND m.team_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.org_memberships owner_membership
          WHERE owner_membership.org_id = target_org AND owner_membership.user_id = record_owner
          AND owner_membership.team_id = m.team_id)))
  )
$$;
CREATE OR REPLACE FUNCTION public.native_can_access_account(target_account text, target_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = target_account
    AND a.org_id = target_org
    AND public.native_can_access_owner(a.org_id, COALESCE(a.owner_id,a.user_id)))
$$;
CREATE OR REPLACE FUNCTION public.native_can_access_tenant_text(target_tenant text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.org_memberships m WHERE m.org_id::text = target_tenant AND m.user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.native_is_org_member(uuid), public.native_is_org_admin(uuid),
  public.native_can_access_owner(uuid,uuid), public.native_can_access_account(text,uuid),
  public.native_can_access_tenant_text(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.native_is_org_member(uuid), public.native_is_org_admin(uuid),
  public.native_can_access_owner(uuid,uuid), public.native_can_access_account(text,uuid),
  public.native_can_access_tenant_text(text) TO closr_app;

CREATE OR REPLACE FUNCTION public.native_user_in_org(target_org uuid, target_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.native_is_org_member(target_org) AND EXISTS (
    SELECT 1 FROM public.org_memberships m WHERE m.org_id=target_org AND m.user_id=target_user)
$$;
REVOKE ALL ON FUNCTION public.native_user_in_org(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.native_user_in_org(uuid,uuid) TO closr_app;

CREATE OR REPLACE FUNCTION public.native_account_in_org(target_account text,target_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.native_is_org_member(target_org) AND EXISTS (
  SELECT 1 FROM public.accounts WHERE id=target_account AND org_id=target_org)
$$;
REVOKE ALL ON FUNCTION public.native_account_in_org(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.native_account_in_org(text,uuid) TO closr_app;

-- Every application table defaults to denied. Explicit policies follow below.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename <> 'native_schema_migrations' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, closr_app', t.tablename);
  END LOOP;
END $$;


GRANT SELECT ON public.organizations TO closr_app;
DROP POLICY IF EXISTS native_read ON public.organizations;
CREATE POLICY native_read ON public.organizations FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(id)));

GRANT UPDATE ON public.organizations TO closr_app;
DROP POLICY IF EXISTS native_update ON public.organizations;

CREATE POLICY native_update ON public.organizations FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(id)));

GRANT SELECT ON public.teams TO closr_app;
DROP POLICY IF EXISTS native_read ON public.teams;
CREATE POLICY native_read ON public.teams FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.teams TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.teams;

CREATE POLICY native_insert ON public.teams FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.teams TO closr_app;
DROP POLICY IF EXISTS native_update ON public.teams;

CREATE POLICY native_update ON public.teams FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT DELETE ON public.teams TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.teams;

CREATE POLICY native_delete ON public.teams FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT SELECT ON public.org_memberships TO closr_app;
DROP POLICY IF EXISTS native_read ON public.org_memberships;
CREATE POLICY native_read ON public.org_memberships FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.org_invitations TO closr_app;
DROP POLICY IF EXISTS native_read ON public.org_invitations;
CREATE POLICY native_read ON public.org_invitations FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT INSERT ON public.org_invitations TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.org_invitations;

CREATE POLICY native_insert ON public.org_invitations FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.org_invitations TO closr_app;
DROP POLICY IF EXISTS native_update ON public.org_invitations;

CREATE POLICY native_update ON public.org_invitations FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT DELETE ON public.org_invitations TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.org_invitations;

CREATE POLICY native_delete ON public.org_invitations FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT SELECT ON public.accounts TO closr_app;
DROP POLICY IF EXISTS native_read ON public.accounts;
CREATE POLICY native_read ON public.accounts FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_can_access_owner(org_id, COALESCE(owner_id,user_id))) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.accounts TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.accounts;

CREATE POLICY native_insert ON public.accounts FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_can_access_owner(org_id, COALESCE(owner_id,user_id))) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)) AND (owner_id IS NULL OR owner_id = auth.uid() OR public.native_is_org_admin(org_id)) AND (owner_id IS NULL OR (org_id IS NULL AND owner_id=auth.uid()) OR public.native_user_in_org(org_id,owner_id)));

GRANT UPDATE ON public.accounts TO closr_app;
DROP POLICY IF EXISTS native_update ON public.accounts;

CREATE POLICY native_update ON public.accounts FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_can_access_owner(org_id, COALESCE(owner_id,user_id))) OR (org_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_can_access_owner(org_id, COALESCE(owner_id,user_id))) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)) AND (owner_id IS NULL OR owner_id = auth.uid() OR public.native_is_org_admin(org_id)) AND (owner_id IS NULL OR (org_id IS NULL AND owner_id=auth.uid()) OR public.native_user_in_org(org_id,owner_id)));

GRANT DELETE ON public.accounts TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.accounts;

CREATE POLICY native_delete ON public.accounts FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_can_access_owner(org_id, COALESCE(owner_id,user_id))) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.contacts TO closr_app;
DROP POLICY IF EXISTS native_read ON public.contacts;
CREATE POLICY native_read ON public.contacts FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.contacts TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.contacts;

CREATE POLICY native_insert ON public.contacts FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.contacts TO closr_app;
DROP POLICY IF EXISTS native_update ON public.contacts;

CREATE POLICY native_update ON public.contacts FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.contacts TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.contacts;

CREATE POLICY native_delete ON public.contacts FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.opportunities TO closr_app;
DROP POLICY IF EXISTS native_read ON public.opportunities;
CREATE POLICY native_read ON public.opportunities FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.opportunities TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.opportunities;

CREATE POLICY native_insert ON public.opportunities FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)) AND (assigned_to IS NULL OR (org_id IS NULL AND assigned_to=auth.uid()) OR public.native_user_in_org(org_id,assigned_to)));

GRANT UPDATE ON public.opportunities TO closr_app;
DROP POLICY IF EXISTS native_update ON public.opportunities;

CREATE POLICY native_update ON public.opportunities FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)) AND (assigned_to IS NULL OR (org_id IS NULL AND assigned_to=auth.uid()) OR public.native_user_in_org(org_id,assigned_to)));

GRANT DELETE ON public.opportunities TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.opportunities;

CREATE POLICY native_delete ON public.opportunities FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.intel_items TO closr_app;
DROP POLICY IF EXISTS native_read ON public.intel_items;
CREATE POLICY native_read ON public.intel_items FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.intel_items TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.intel_items;

CREATE POLICY native_insert ON public.intel_items FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.intel_items TO closr_app;
DROP POLICY IF EXISTS native_update ON public.intel_items;

CREATE POLICY native_update ON public.intel_items FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.intel_items TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.intel_items;

CREATE POLICY native_delete ON public.intel_items FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.email_decodes TO closr_app;
DROP POLICY IF EXISTS native_read ON public.email_decodes;
CREATE POLICY native_read ON public.email_decodes FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.email_decodes TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.email_decodes;

CREATE POLICY native_insert ON public.email_decodes FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.email_decodes TO closr_app;
DROP POLICY IF EXISTS native_update ON public.email_decodes;

CREATE POLICY native_update ON public.email_decodes FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.email_decodes TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.email_decodes;

CREATE POLICY native_delete ON public.email_decodes FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.composed_emails TO closr_app;
DROP POLICY IF EXISTS native_read ON public.composed_emails;
CREATE POLICY native_read ON public.composed_emails FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.composed_emails TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.composed_emails;

CREATE POLICY native_insert ON public.composed_emails FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.composed_emails TO closr_app;
DROP POLICY IF EXISTS native_update ON public.composed_emails;

CREATE POLICY native_update ON public.composed_emails FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.composed_emails TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.composed_emails;

CREATE POLICY native_delete ON public.composed_emails FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.meeting_preps TO closr_app;
DROP POLICY IF EXISTS native_read ON public.meeting_preps;
CREATE POLICY native_read ON public.meeting_preps FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.meeting_preps TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.meeting_preps;

CREATE POLICY native_insert ON public.meeting_preps FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.meeting_preps TO closr_app;
DROP POLICY IF EXISTS native_update ON public.meeting_preps;

CREATE POLICY native_update ON public.meeting_preps FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.meeting_preps TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.meeting_preps;

CREATE POLICY native_delete ON public.meeting_preps FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.discovery_notes TO closr_app;
DROP POLICY IF EXISTS native_read ON public.discovery_notes;
CREATE POLICY native_read ON public.discovery_notes FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.discovery_notes TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.discovery_notes;

CREATE POLICY native_insert ON public.discovery_notes FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.discovery_notes TO closr_app;
DROP POLICY IF EXISTS native_update ON public.discovery_notes;

CREATE POLICY native_update ON public.discovery_notes FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.discovery_notes TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.discovery_notes;

CREATE POLICY native_delete ON public.discovery_notes FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.knowledge_items TO closr_app;
DROP POLICY IF EXISTS native_read ON public.knowledge_items;
CREATE POLICY native_read ON public.knowledge_items FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.knowledge_items TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.knowledge_items;

CREATE POLICY native_insert ON public.knowledge_items FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.knowledge_items TO closr_app;
DROP POLICY IF EXISTS native_update ON public.knowledge_items;

CREATE POLICY native_update ON public.knowledge_items FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.knowledge_items TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.knowledge_items;

CREATE POLICY native_delete ON public.knowledge_items FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.user_settings TO closr_app;
DROP POLICY IF EXISTS native_read ON public.user_settings;
CREATE POLICY native_read ON public.user_settings FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT INSERT ON public.user_settings TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.user_settings;

CREATE POLICY native_insert ON public.user_settings FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT UPDATE ON public.user_settings TO closr_app;
DROP POLICY IF EXISTS native_update ON public.user_settings;

CREATE POLICY native_update ON public.user_settings FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (user_id = auth.uid())) WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT DELETE ON public.user_settings TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.user_settings;

CREATE POLICY native_delete ON public.user_settings FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT SELECT ON public.tasks TO closr_app;
DROP POLICY IF EXISTS native_read ON public.tasks;
CREATE POLICY native_read ON public.tasks FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND (public.native_can_access_account(account_id,org_id) OR (assigned_to=auth.uid() AND public.native_is_org_member(org_id) AND (account_id IS NULL OR public.native_account_in_org(account_id,org_id))))) OR (account_id IS NULL AND (public.native_can_access_owner(org_id,user_id) OR (assigned_to=auth.uid() AND public.native_is_org_member(org_id) AND (account_id IS NULL OR public.native_account_in_org(account_id,org_id))))))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.tasks TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.tasks;

CREATE POLICY native_insert ON public.tasks FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND (public.native_can_access_account(account_id,org_id) OR (assigned_to=auth.uid() AND public.native_is_org_member(org_id) AND (account_id IS NULL OR public.native_account_in_org(account_id,org_id))))) OR (account_id IS NULL AND (public.native_can_access_owner(org_id,user_id) OR (assigned_to=auth.uid() AND public.native_is_org_member(org_id) AND (account_id IS NULL OR public.native_account_in_org(account_id,org_id))))))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)) AND (assigned_to IS NULL OR (org_id IS NULL AND assigned_to=auth.uid()) OR public.native_user_in_org(org_id,assigned_to)));

GRANT UPDATE ON public.tasks TO closr_app;
DROP POLICY IF EXISTS native_update ON public.tasks;

CREATE POLICY native_update ON public.tasks FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND (public.native_can_access_account(account_id,org_id) OR (assigned_to=auth.uid() AND public.native_is_org_member(org_id) AND (account_id IS NULL OR public.native_account_in_org(account_id,org_id))))) OR (account_id IS NULL AND (public.native_can_access_owner(org_id,user_id) OR (assigned_to=auth.uid() AND public.native_is_org_member(org_id) AND (account_id IS NULL OR public.native_account_in_org(account_id,org_id))))))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND (public.native_can_access_account(account_id,org_id) OR (assigned_to=auth.uid() AND public.native_is_org_member(org_id) AND (account_id IS NULL OR public.native_account_in_org(account_id,org_id))))) OR (account_id IS NULL AND (public.native_can_access_owner(org_id,user_id) OR (assigned_to=auth.uid() AND public.native_is_org_member(org_id) AND (account_id IS NULL OR public.native_account_in_org(account_id,org_id))))))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (assigned_to IS NULL OR (org_id IS NULL AND assigned_to=auth.uid()) OR public.native_user_in_org(org_id,assigned_to)));

GRANT DELETE ON public.tasks TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.tasks;

CREATE POLICY native_delete ON public.tasks FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND (public.native_can_access_account(account_id,org_id) OR (assigned_to=auth.uid() AND public.native_is_org_member(org_id) AND (account_id IS NULL OR public.native_account_in_org(account_id,org_id))))) OR (account_id IS NULL AND (public.native_can_access_owner(org_id,user_id) OR (assigned_to=auth.uid() AND public.native_is_org_member(org_id) AND (account_id IS NULL OR public.native_account_in_org(account_id,org_id))))))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.activity_logs TO closr_app;
DROP POLICY IF EXISTS native_read ON public.activity_logs;
CREATE POLICY native_read ON public.activity_logs FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.activity_logs TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.activity_logs;

CREATE POLICY native_insert ON public.activity_logs FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.activity_logs TO closr_app;
DROP POLICY IF EXISTS native_update ON public.activity_logs;

CREATE POLICY native_update ON public.activity_logs FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.activity_logs TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.activity_logs;

CREATE POLICY native_delete ON public.activity_logs FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.ai_advices TO closr_app;
DROP POLICY IF EXISTS native_read ON public.ai_advices;
CREATE POLICY native_read ON public.ai_advices FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.ai_advices TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.ai_advices;

CREATE POLICY native_insert ON public.ai_advices FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.ai_advices TO closr_app;
DROP POLICY IF EXISTS native_update ON public.ai_advices;

CREATE POLICY native_update ON public.ai_advices FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.ai_advices TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.ai_advices;

CREATE POLICY native_delete ON public.ai_advices FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.decode_feedbacks TO closr_app;
DROP POLICY IF EXISTS native_read ON public.decode_feedbacks;
CREATE POLICY native_read ON public.decode_feedbacks FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.decode_feedbacks TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.decode_feedbacks;

CREATE POLICY native_insert ON public.decode_feedbacks FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.decode_feedbacks TO closr_app;
DROP POLICY IF EXISTS native_update ON public.decode_feedbacks;

CREATE POLICY native_update ON public.decode_feedbacks FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.decode_feedbacks TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.decode_feedbacks;

CREATE POLICY native_delete ON public.decode_feedbacks FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.knowledge_base TO closr_app;
DROP POLICY IF EXISTS native_read ON public.knowledge_base;
CREATE POLICY native_read ON public.knowledge_base FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT INSERT ON public.knowledge_base TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.knowledge_base;

CREATE POLICY native_insert ON public.knowledge_base FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT UPDATE ON public.knowledge_base TO closr_app;
DROP POLICY IF EXISTS native_update ON public.knowledge_base;

CREATE POLICY native_update ON public.knowledge_base FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id))))) WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT DELETE ON public.knowledge_base TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.knowledge_base;

CREATE POLICY native_delete ON public.knowledge_base FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT SELECT ON public.contact_profiles_v2 TO closr_app;
DROP POLICY IF EXISTS native_read ON public.contact_profiles_v2;
CREATE POLICY native_read ON public.contact_profiles_v2 FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT INSERT ON public.contact_profiles_v2 TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.contact_profiles_v2;

CREATE POLICY native_insert ON public.contact_profiles_v2 FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT UPDATE ON public.contact_profiles_v2 TO closr_app;
DROP POLICY IF EXISTS native_update ON public.contact_profiles_v2;

CREATE POLICY native_update ON public.contact_profiles_v2 FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (user_id = auth.uid())) WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT DELETE ON public.contact_profiles_v2 TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.contact_profiles_v2;

CREATE POLICY native_delete ON public.contact_profiles_v2 FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT SELECT ON public.outreach_logs TO closr_app;
DROP POLICY IF EXISTS native_read ON public.outreach_logs;
CREATE POLICY native_read ON public.outreach_logs FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT INSERT ON public.outreach_logs TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.outreach_logs;

CREATE POLICY native_insert ON public.outreach_logs FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT UPDATE ON public.outreach_logs TO closr_app;
DROP POLICY IF EXISTS native_update ON public.outreach_logs;

CREATE POLICY native_update ON public.outreach_logs FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (user_id = auth.uid())) WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT DELETE ON public.outreach_logs TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.outreach_logs;

CREATE POLICY native_delete ON public.outreach_logs FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

-- strategy_cases: server-only; no browser role grant.

GRANT SELECT ON public.intel TO closr_app;
DROP POLICY IF EXISTS native_read ON public.intel;
CREATE POLICY native_read ON public.intel FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT INSERT ON public.intel TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.intel;

CREATE POLICY native_insert ON public.intel FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT UPDATE ON public.intel TO closr_app;
DROP POLICY IF EXISTS native_update ON public.intel;

CREATE POLICY native_update ON public.intel FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (user_id = auth.uid())) WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT DELETE ON public.intel TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.intel;

CREATE POLICY native_delete ON public.intel FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (user_id = auth.uid()));

GRANT SELECT ON public.ai_forecasts TO closr_app;
DROP POLICY IF EXISTS native_read ON public.ai_forecasts;
CREATE POLICY native_read ON public.ai_forecasts FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.ai_forecasts TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.ai_forecasts;

CREATE POLICY native_insert ON public.ai_forecasts FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.ai_forecasts TO closr_app;
DROP POLICY IF EXISTS native_update ON public.ai_forecasts;

CREATE POLICY native_update ON public.ai_forecasts FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.ai_forecasts TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.ai_forecasts;

CREATE POLICY native_delete ON public.ai_forecasts FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.comments TO closr_app;
DROP POLICY IF EXISTS native_read ON public.comments;
CREATE POLICY native_read ON public.comments FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.comments TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.comments;

CREATE POLICY native_insert ON public.comments FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.comments TO closr_app;
DROP POLICY IF EXISTS native_update ON public.comments;

CREATE POLICY native_update ON public.comments FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.comments TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.comments;

CREATE POLICY native_delete ON public.comments FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.source_records TO closr_app;
DROP POLICY IF EXISTS native_read ON public.source_records;
CREATE POLICY native_read ON public.source_records FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT INSERT ON public.source_records TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.source_records;

CREATE POLICY native_insert ON public.source_records FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT UPDATE ON public.source_records TO closr_app;
DROP POLICY IF EXISTS native_update ON public.source_records;

CREATE POLICY native_update ON public.source_records FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id))))) WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT DELETE ON public.source_records TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.source_records;

CREATE POLICY native_delete ON public.source_records FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT SELECT ON public.account_memory_snapshots TO closr_app;
DROP POLICY IF EXISTS native_read ON public.account_memory_snapshots;
CREATE POLICY native_read ON public.account_memory_snapshots FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.account_memory_snapshots TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.account_memory_snapshots;

CREATE POLICY native_insert ON public.account_memory_snapshots FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.account_memory_snapshots TO closr_app;
DROP POLICY IF EXISTS native_update ON public.account_memory_snapshots;

CREATE POLICY native_update ON public.account_memory_snapshots FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.account_memory_snapshots TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.account_memory_snapshots;

CREATE POLICY native_delete ON public.account_memory_snapshots FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.memory_conflicts TO closr_app;
DROP POLICY IF EXISTS native_read ON public.memory_conflicts;
CREATE POLICY native_read ON public.memory_conflicts FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.memory_conflicts TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.memory_conflicts;

CREATE POLICY native_insert ON public.memory_conflicts FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.memory_conflicts TO closr_app;
DROP POLICY IF EXISTS native_update ON public.memory_conflicts;

CREATE POLICY native_update ON public.memory_conflicts FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.memory_conflicts TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.memory_conflicts;

CREATE POLICY native_delete ON public.memory_conflicts FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.account_knowledge_pages TO closr_app;
DROP POLICY IF EXISTS native_read ON public.account_knowledge_pages;
CREATE POLICY native_read ON public.account_knowledge_pages FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT INSERT ON public.account_knowledge_pages TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.account_knowledge_pages;

CREATE POLICY native_insert ON public.account_knowledge_pages FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT UPDATE ON public.account_knowledge_pages TO closr_app;
DROP POLICY IF EXISTS native_update ON public.account_knowledge_pages;

CREATE POLICY native_update ON public.account_knowledge_pages FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id))))) WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT DELETE ON public.account_knowledge_pages TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.account_knowledge_pages;

CREATE POLICY native_delete ON public.account_knowledge_pages FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT SELECT ON public.account_claims TO closr_app;
DROP POLICY IF EXISTS native_read ON public.account_claims;
CREATE POLICY native_read ON public.account_claims FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT INSERT ON public.account_claims TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.account_claims;

CREATE POLICY native_insert ON public.account_claims FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT UPDATE ON public.account_claims TO closr_app;
DROP POLICY IF EXISTS native_update ON public.account_claims;

CREATE POLICY native_update ON public.account_claims FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id))))) WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT DELETE ON public.account_claims TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.account_claims;

CREATE POLICY native_delete ON public.account_claims FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT SELECT ON public.account_evidence TO closr_app;
DROP POLICY IF EXISTS native_read ON public.account_evidence;
CREATE POLICY native_read ON public.account_evidence FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT INSERT ON public.account_evidence TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.account_evidence;

CREATE POLICY native_insert ON public.account_evidence FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT UPDATE ON public.account_evidence TO closr_app;
DROP POLICY IF EXISTS native_update ON public.account_evidence;

CREATE POLICY native_update ON public.account_evidence FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id))))) WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT DELETE ON public.account_evidence TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.account_evidence;

CREATE POLICY native_delete ON public.account_evidence FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT SELECT ON public.account_open_questions TO closr_app;
DROP POLICY IF EXISTS native_read ON public.account_open_questions;
CREATE POLICY native_read ON public.account_open_questions FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT INSERT ON public.account_open_questions TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.account_open_questions;

CREATE POLICY native_insert ON public.account_open_questions FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT UPDATE ON public.account_open_questions TO closr_app;
DROP POLICY IF EXISTS native_update ON public.account_open_questions;

CREATE POLICY native_update ON public.account_open_questions FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id))))) WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT DELETE ON public.account_open_questions TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.account_open_questions;

CREATE POLICY native_delete ON public.account_open_questions FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT SELECT ON public.knowledge_update_log TO closr_app;
DROP POLICY IF EXISTS native_read ON public.knowledge_update_log;
CREATE POLICY native_read ON public.knowledge_update_log FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT INSERT ON public.knowledge_update_log TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.knowledge_update_log;

CREATE POLICY native_insert ON public.knowledge_update_log FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT UPDATE ON public.knowledge_update_log TO closr_app;
DROP POLICY IF EXISTS native_update ON public.knowledge_update_log;

CREATE POLICY native_update ON public.knowledge_update_log FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id))))) WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT DELETE ON public.knowledge_update_log TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.knowledge_update_log;

CREATE POLICY native_delete ON public.knowledge_update_log FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

-- sync_logs: server-only; no browser role grant.

-- ai_invocation_logs: server-only; no browser role grant.

GRANT SELECT ON public.strategic_plays TO closr_app;
DROP POLICY IF EXISTS native_read ON public.strategic_plays;
CREATE POLICY native_read ON public.strategic_plays FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.strategic_plays TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.strategic_plays;

CREATE POLICY native_insert ON public.strategic_plays FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.strategic_plays TO closr_app;
DROP POLICY IF EXISTS native_update ON public.strategic_plays;

CREATE POLICY native_update ON public.strategic_plays FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.strategic_plays TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.strategic_plays;

CREATE POLICY native_delete ON public.strategic_plays FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.pursuit_teams TO closr_app;
DROP POLICY IF EXISTS native_read ON public.pursuit_teams;
CREATE POLICY native_read ON public.pursuit_teams FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT INSERT ON public.pursuit_teams TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.pursuit_teams;

CREATE POLICY native_insert ON public.pursuit_teams FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT UPDATE ON public.pursuit_teams TO closr_app;
DROP POLICY IF EXISTS native_update ON public.pursuit_teams;

CREATE POLICY native_update ON public.pursuit_teams FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id))))) WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT DELETE ON public.pursuit_teams TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.pursuit_teams;

CREATE POLICY native_delete ON public.pursuit_teams FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT SELECT ON public.responsibility_catalog TO closr_app;
DROP POLICY IF EXISTS native_read ON public.responsibility_catalog;
CREATE POLICY native_read ON public.responsibility_catalog FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.responsibility_catalog TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.responsibility_catalog;

CREATE POLICY native_insert ON public.responsibility_catalog FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.responsibility_catalog TO closr_app;
DROP POLICY IF EXISTS native_update ON public.responsibility_catalog;

CREATE POLICY native_update ON public.responsibility_catalog FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.responsibility_catalog TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.responsibility_catalog;

CREATE POLICY native_delete ON public.responsibility_catalog FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.pursuit_team_members TO closr_app;
DROP POLICY IF EXISTS native_read ON public.pursuit_team_members;
CREATE POLICY native_read ON public.pursuit_team_members FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.pursuit_team_members TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.pursuit_team_members;

CREATE POLICY native_insert ON public.pursuit_team_members FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.pursuit_team_members TO closr_app;
DROP POLICY IF EXISTS native_update ON public.pursuit_team_members;

CREATE POLICY native_update ON public.pursuit_team_members FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.pursuit_team_members TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.pursuit_team_members;

CREATE POLICY native_delete ON public.pursuit_team_members FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.pursuit_team_member_responsibilities TO closr_app;
DROP POLICY IF EXISTS native_read ON public.pursuit_team_member_responsibilities;
CREATE POLICY native_read ON public.pursuit_team_member_responsibilities FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.pursuit_team_member_responsibilities TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.pursuit_team_member_responsibilities;

CREATE POLICY native_insert ON public.pursuit_team_member_responsibilities FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.pursuit_team_member_responsibilities TO closr_app;
DROP POLICY IF EXISTS native_update ON public.pursuit_team_member_responsibilities;

CREATE POLICY native_update ON public.pursuit_team_member_responsibilities FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.pursuit_team_member_responsibilities TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.pursuit_team_member_responsibilities;

CREATE POLICY native_delete ON public.pursuit_team_member_responsibilities FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.contact_coverage_assignments TO closr_app;
DROP POLICY IF EXISTS native_read ON public.contact_coverage_assignments;
CREATE POLICY native_read ON public.contact_coverage_assignments FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.contact_coverage_assignments TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.contact_coverage_assignments;

CREATE POLICY native_insert ON public.contact_coverage_assignments FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.contact_coverage_assignments TO closr_app;
DROP POLICY IF EXISTS native_update ON public.contact_coverage_assignments;

CREATE POLICY native_update ON public.contact_coverage_assignments FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.contact_coverage_assignments TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.contact_coverage_assignments;

CREATE POLICY native_delete ON public.contact_coverage_assignments FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.contact_coverage_responsibilities TO closr_app;
DROP POLICY IF EXISTS native_read ON public.contact_coverage_responsibilities;
CREATE POLICY native_read ON public.contact_coverage_responsibilities FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.contact_coverage_responsibilities TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.contact_coverage_responsibilities;

CREATE POLICY native_insert ON public.contact_coverage_responsibilities FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.contact_coverage_responsibilities TO closr_app;
DROP POLICY IF EXISTS native_update ON public.contact_coverage_responsibilities;

CREATE POLICY native_update ON public.contact_coverage_responsibilities FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.contact_coverage_responsibilities TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.contact_coverage_responsibilities;

CREATE POLICY native_delete ON public.contact_coverage_responsibilities FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.relationship_signals TO closr_app;
DROP POLICY IF EXISTS native_read ON public.relationship_signals;
CREATE POLICY native_read ON public.relationship_signals FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT INSERT ON public.relationship_signals TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.relationship_signals;

CREATE POLICY native_insert ON public.relationship_signals FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT UPDATE ON public.relationship_signals TO closr_app;
DROP POLICY IF EXISTS native_update ON public.relationship_signals;

CREATE POLICY native_update ON public.relationship_signals FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id))))) WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT DELETE ON public.relationship_signals TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.relationship_signals;

CREATE POLICY native_delete ON public.relationship_signals FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT SELECT ON public.relationship_edges TO closr_app;
DROP POLICY IF EXISTS native_read ON public.relationship_edges;
CREATE POLICY native_read ON public.relationship_edges FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT INSERT ON public.relationship_edges TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.relationship_edges;

CREATE POLICY native_insert ON public.relationship_edges FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT UPDATE ON public.relationship_edges TO closr_app;
DROP POLICY IF EXISTS native_update ON public.relationship_edges;

CREATE POLICY native_update ON public.relationship_edges FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id))))) WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT DELETE ON public.relationship_edges TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.relationship_edges;

CREATE POLICY native_delete ON public.relationship_edges FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT SELECT ON public.pallas_artifacts TO closr_app;
DROP POLICY IF EXISTS native_read ON public.pallas_artifacts;
CREATE POLICY native_read ON public.pallas_artifacts FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.pallas_artifacts TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.pallas_artifacts;

CREATE POLICY native_insert ON public.pallas_artifacts FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.pallas_artifacts TO closr_app;
DROP POLICY IF EXISTS native_update ON public.pallas_artifacts;

CREATE POLICY native_update ON public.pallas_artifacts FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.pallas_artifacts TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.pallas_artifacts;

CREATE POLICY native_delete ON public.pallas_artifacts FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.pallas_artifact_versions TO closr_app;
DROP POLICY IF EXISTS native_read ON public.pallas_artifact_versions;
CREATE POLICY native_read ON public.pallas_artifact_versions FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.pallas_artifact_versions TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.pallas_artifact_versions;

CREATE POLICY native_insert ON public.pallas_artifact_versions FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.pallas_artifact_versions TO closr_app;
DROP POLICY IF EXISTS native_update ON public.pallas_artifact_versions;

CREATE POLICY native_update ON public.pallas_artifact_versions FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.pallas_artifact_versions TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.pallas_artifact_versions;

CREATE POLICY native_delete ON public.pallas_artifact_versions FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.pallas_action_proposals TO closr_app;
DROP POLICY IF EXISTS native_read ON public.pallas_action_proposals;
CREATE POLICY native_read ON public.pallas_action_proposals FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.pallas_action_proposals TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.pallas_action_proposals;

CREATE POLICY native_insert ON public.pallas_action_proposals FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.pallas_action_proposals TO closr_app;
DROP POLICY IF EXISTS native_update ON public.pallas_action_proposals;

CREATE POLICY native_update ON public.pallas_action_proposals FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.pallas_action_proposals TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.pallas_action_proposals;

CREATE POLICY native_delete ON public.pallas_action_proposals FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.pallas_tool_runs TO closr_app;
DROP POLICY IF EXISTS native_read ON public.pallas_tool_runs;
CREATE POLICY native_read ON public.pallas_tool_runs FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.pallas_tool_runs TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.pallas_tool_runs;

CREATE POLICY native_insert ON public.pallas_tool_runs FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.pallas_tool_runs TO closr_app;
DROP POLICY IF EXISTS native_update ON public.pallas_tool_runs;

CREATE POLICY native_update ON public.pallas_tool_runs FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.pallas_tool_runs TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.pallas_tool_runs;

CREATE POLICY native_delete ON public.pallas_tool_runs FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.judgment_ownership_assignments TO closr_app;
DROP POLICY IF EXISTS native_read ON public.judgment_ownership_assignments;
CREATE POLICY native_read ON public.judgment_ownership_assignments FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.judgment_ownership_assignments TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.judgment_ownership_assignments;

CREATE POLICY native_insert ON public.judgment_ownership_assignments FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.judgment_ownership_assignments TO closr_app;
DROP POLICY IF EXISTS native_update ON public.judgment_ownership_assignments;

CREATE POLICY native_update ON public.judgment_ownership_assignments FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.judgment_ownership_assignments TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.judgment_ownership_assignments;

CREATE POLICY native_delete ON public.judgment_ownership_assignments FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.leads TO closr_app;
DROP POLICY IF EXISTS native_read ON public.leads;
CREATE POLICY native_read ON public.leads FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.leads TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.leads;

CREATE POLICY native_insert ON public.leads FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)) AND (owner_id IS NULL OR owner_id = auth.uid() OR public.native_is_org_admin(org_id)) AND (owner_id IS NULL OR (org_id IS NULL AND owner_id=auth.uid()) OR public.native_user_in_org(org_id,owner_id)));

GRANT UPDATE ON public.leads TO closr_app;
DROP POLICY IF EXISTS native_update ON public.leads;

CREATE POLICY native_update ON public.leads FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)) AND (owner_id IS NULL OR owner_id = auth.uid() OR public.native_is_org_admin(org_id)) AND (owner_id IS NULL OR (org_id IS NULL AND owner_id=auth.uid()) OR public.native_user_in_org(org_id,owner_id)));

GRANT DELETE ON public.leads TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.leads;

CREATE POLICY native_delete ON public.leads FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.contact_opportunity_roles TO closr_app;
DROP POLICY IF EXISTS native_read ON public.contact_opportunity_roles;
CREATE POLICY native_read ON public.contact_opportunity_roles FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.contact_opportunity_roles TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.contact_opportunity_roles;

CREATE POLICY native_insert ON public.contact_opportunity_roles FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.contact_opportunity_roles TO closr_app;
DROP POLICY IF EXISTS native_update ON public.contact_opportunity_roles;

CREATE POLICY native_update ON public.contact_opportunity_roles FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.contact_opportunity_roles TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.contact_opportunity_roles;

CREATE POLICY native_delete ON public.contact_opportunity_roles FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.timeline_events TO closr_app;
DROP POLICY IF EXISTS native_read ON public.timeline_events;
CREATE POLICY native_read ON public.timeline_events FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.timeline_events TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.timeline_events;

CREATE POLICY native_insert ON public.timeline_events FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.timeline_events TO closr_app;
DROP POLICY IF EXISTS native_update ON public.timeline_events;

CREATE POLICY native_update ON public.timeline_events FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.timeline_events TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.timeline_events;

CREATE POLICY native_delete ON public.timeline_events FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.timeline_event_links TO closr_app;
DROP POLICY IF EXISTS native_read ON public.timeline_event_links;
CREATE POLICY native_read ON public.timeline_event_links FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.timeline_event_links TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.timeline_event_links;

CREATE POLICY native_insert ON public.timeline_event_links FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.timeline_event_links TO closr_app;
DROP POLICY IF EXISTS native_update ON public.timeline_event_links;

CREATE POLICY native_update ON public.timeline_event_links FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.timeline_event_links TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.timeline_event_links;

CREATE POLICY native_delete ON public.timeline_event_links FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.opportunity_stage_history TO closr_app;
DROP POLICY IF EXISTS native_read ON public.opportunity_stage_history;
CREATE POLICY native_read ON public.opportunity_stage_history FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.opportunity_stage_history TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.opportunity_stage_history;

CREATE POLICY native_insert ON public.opportunity_stage_history FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.opportunity_stage_history TO closr_app;
DROP POLICY IF EXISTS native_update ON public.opportunity_stage_history;

CREATE POLICY native_update ON public.opportunity_stage_history FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.opportunity_stage_history TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.opportunity_stage_history;

CREATE POLICY native_delete ON public.opportunity_stage_history FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.opportunity_close_date_history TO closr_app;
DROP POLICY IF EXISTS native_read ON public.opportunity_close_date_history;
CREATE POLICY native_read ON public.opportunity_close_date_history FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.opportunity_close_date_history TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.opportunity_close_date_history;

CREATE POLICY native_insert ON public.opportunity_close_date_history FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.opportunity_close_date_history TO closr_app;
DROP POLICY IF EXISTS native_update ON public.opportunity_close_date_history;

CREATE POLICY native_update ON public.opportunity_close_date_history FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.opportunity_close_date_history TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.opportunity_close_date_history;

CREATE POLICY native_delete ON public.opportunity_close_date_history FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.ai_insights TO closr_app;
DROP POLICY IF EXISTS native_read ON public.ai_insights;
CREATE POLICY native_read ON public.ai_insights FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.ai_insights TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.ai_insights;

CREATE POLICY native_insert ON public.ai_insights FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.ai_insights TO closr_app;
DROP POLICY IF EXISTS native_update ON public.ai_insights;

CREATE POLICY native_update ON public.ai_insights FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.ai_insights TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.ai_insights;

CREATE POLICY native_delete ON public.ai_insights FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.ai_events TO closr_app;
DROP POLICY IF EXISTS native_read ON public.ai_events;
CREATE POLICY native_read ON public.ai_events FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.ai_events TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.ai_events;

CREATE POLICY native_insert ON public.ai_events FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.ai_events TO closr_app;
DROP POLICY IF EXISTS native_update ON public.ai_events;

CREATE POLICY native_update ON public.ai_events FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.ai_events TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.ai_events;

CREATE POLICY native_delete ON public.ai_events FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.channel_partners TO closr_app;
DROP POLICY IF EXISTS native_read ON public.channel_partners;
CREATE POLICY native_read ON public.channel_partners FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.channel_partners TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.channel_partners;

CREATE POLICY native_insert ON public.channel_partners FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.channel_partners TO closr_app;
DROP POLICY IF EXISTS native_update ON public.channel_partners;

CREATE POLICY native_update ON public.channel_partners FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.channel_partners TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.channel_partners;

CREATE POLICY native_delete ON public.channel_partners FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.deal_registrations TO closr_app;
DROP POLICY IF EXISTS native_read ON public.deal_registrations;
CREATE POLICY native_read ON public.deal_registrations FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.deal_registrations TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.deal_registrations;

CREATE POLICY native_insert ON public.deal_registrations FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.deal_registrations TO closr_app;
DROP POLICY IF EXISTS native_update ON public.deal_registrations;

CREATE POLICY native_update ON public.deal_registrations FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.deal_registrations TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.deal_registrations;

CREATE POLICY native_delete ON public.deal_registrations FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.quotas TO closr_app;
DROP POLICY IF EXISTS native_read ON public.quotas;
CREATE POLICY native_read ON public.quotas FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.quotas TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.quotas;

CREATE POLICY native_insert ON public.quotas FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.quotas TO closr_app;
DROP POLICY IF EXISTS native_update ON public.quotas;

CREATE POLICY native_update ON public.quotas FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.quotas TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.quotas;

CREATE POLICY native_delete ON public.quotas FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT SELECT ON public.forecasts TO closr_app;
DROP POLICY IF EXISTS native_read ON public.forecasts;
CREATE POLICY native_read ON public.forecasts FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.forecasts TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.forecasts;

CREATE POLICY native_insert ON public.forecasts FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.forecasts TO closr_app;
DROP POLICY IF EXISTS native_update ON public.forecasts;

CREATE POLICY native_update ON public.forecasts FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.forecasts TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.forecasts;

CREATE POLICY native_delete ON public.forecasts FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT SELECT ON public.org_wide_defaults TO closr_app;
DROP POLICY IF EXISTS native_read ON public.org_wide_defaults;
CREATE POLICY native_read ON public.org_wide_defaults FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.org_wide_defaults TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.org_wide_defaults;

CREATE POLICY native_insert ON public.org_wide_defaults FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.org_wide_defaults TO closr_app;
DROP POLICY IF EXISTS native_update ON public.org_wide_defaults;

CREATE POLICY native_update ON public.org_wide_defaults FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT DELETE ON public.org_wide_defaults TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.org_wide_defaults;

CREATE POLICY native_delete ON public.org_wide_defaults FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT SELECT ON public.record_shares TO closr_app;
DROP POLICY IF EXISTS native_read ON public.record_shares;
CREATE POLICY native_read ON public.record_shares FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.record_shares TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.record_shares;

CREATE POLICY native_insert ON public.record_shares FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.record_shares TO closr_app;
DROP POLICY IF EXISTS native_update ON public.record_shares;

CREATE POLICY native_update ON public.record_shares FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT DELETE ON public.record_shares TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.record_shares;

CREATE POLICY native_delete ON public.record_shares FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

-- ownership_transfers: server-only; no browser role grant.

GRANT SELECT ON public.pool_rules TO closr_app;
DROP POLICY IF EXISTS native_read ON public.pool_rules;
CREATE POLICY native_read ON public.pool_rules FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.pool_rules TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.pool_rules;

CREATE POLICY native_insert ON public.pool_rules FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.pool_rules TO closr_app;
DROP POLICY IF EXISTS native_update ON public.pool_rules;

CREATE POLICY native_update ON public.pool_rules FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT DELETE ON public.pool_rules TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.pool_rules;

CREATE POLICY native_delete ON public.pool_rules FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

-- audit_log: server-only; no browser role grant.

GRANT SELECT ON public.integration_connections TO closr_app;
DROP POLICY IF EXISTS native_read ON public.integration_connections;
CREATE POLICY native_read ON public.integration_connections FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.integration_connections TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.integration_connections;

CREATE POLICY native_insert ON public.integration_connections FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.integration_connections TO closr_app;
DROP POLICY IF EXISTS native_update ON public.integration_connections;

CREATE POLICY native_update ON public.integration_connections FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.integration_connections TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.integration_connections;

CREATE POLICY native_delete ON public.integration_connections FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

-- integration_tokens: server-only; no browser role grant.

-- integration_sync_state: service-only synchronization cursor, never granted to browser role.
DROP POLICY IF EXISTS native_read ON public.integration_sync_state;

GRANT SELECT ON public.integration_emails TO closr_app;
DROP POLICY IF EXISTS native_read ON public.integration_emails;
CREATE POLICY native_read ON public.integration_emails FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.integration_emails TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.integration_emails;

CREATE POLICY native_insert ON public.integration_emails FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.integration_emails TO closr_app;
DROP POLICY IF EXISTS native_update ON public.integration_emails;

CREATE POLICY native_update ON public.integration_emails FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.integration_emails TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.integration_emails;

CREATE POLICY native_delete ON public.integration_emails FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.integration_audit_logs TO closr_app;
DROP POLICY IF EXISTS native_read ON public.integration_audit_logs;
CREATE POLICY native_read ON public.integration_audit_logs FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

-- Integration audit writes are server-only.
DROP POLICY IF EXISTS native_insert ON public.integration_audit_logs;

-- Integration audit writes are server-only.
DROP POLICY IF EXISTS native_update ON public.integration_audit_logs;

-- Integration audit writes are server-only.
DROP POLICY IF EXISTS native_delete ON public.integration_audit_logs;

GRANT SELECT ON public.agent_notifications TO closr_app;
DROP POLICY IF EXISTS native_read ON public.agent_notifications;
CREATE POLICY native_read ON public.agent_notifications FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id) AND (user_id = auth.uid() OR user_id IS NULL)));

GRANT INSERT ON public.agent_notifications TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.agent_notifications;

CREATE POLICY native_insert ON public.agent_notifications FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id) AND (user_id = auth.uid() OR user_id IS NULL)));

GRANT UPDATE ON public.agent_notifications TO closr_app;
DROP POLICY IF EXISTS native_update ON public.agent_notifications;

CREATE POLICY native_update ON public.agent_notifications FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id) AND (user_id = auth.uid() OR user_id IS NULL))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id) AND (user_id = auth.uid() OR user_id IS NULL)));

GRANT DELETE ON public.agent_notifications TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.agent_notifications;

CREATE POLICY native_delete ON public.agent_notifications FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id) AND (user_id = auth.uid() OR user_id IS NULL)));

GRANT SELECT ON public.products TO closr_app;
DROP POLICY IF EXISTS native_read ON public.products;
CREATE POLICY native_read ON public.products FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.products TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.products;

CREATE POLICY native_insert ON public.products FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.products TO closr_app;
DROP POLICY IF EXISTS native_update ON public.products;

CREATE POLICY native_update ON public.products FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.products TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.products;

CREATE POLICY native_delete ON public.products FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.quotes TO closr_app;
DROP POLICY IF EXISTS native_read ON public.quotes;
CREATE POLICY native_read ON public.quotes FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.quotes TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.quotes;

CREATE POLICY native_insert ON public.quotes FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.quotes TO closr_app;
DROP POLICY IF EXISTS native_update ON public.quotes;

CREATE POLICY native_update ON public.quotes FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.quotes TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.quotes;

CREATE POLICY native_delete ON public.quotes FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.quote_items TO closr_app;
DROP POLICY IF EXISTS native_read ON public.quote_items;
CREATE POLICY native_read ON public.quote_items FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_items.quote_id)));

GRANT INSERT ON public.quote_items TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.quote_items;

CREATE POLICY native_insert ON public.quote_items FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_items.quote_id)));

GRANT UPDATE ON public.quote_items TO closr_app;
DROP POLICY IF EXISTS native_update ON public.quote_items;

CREATE POLICY native_update ON public.quote_items FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_items.quote_id))) WITH CHECK (auth.uid() IS NOT NULL AND (EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_items.quote_id)));

GRANT DELETE ON public.quote_items TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.quote_items;

CREATE POLICY native_delete ON public.quote_items FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_items.quote_id)));

GRANT SELECT ON public.meeting_recordings TO closr_app;
DROP POLICY IF EXISTS native_read ON public.meeting_recordings;
CREATE POLICY native_read ON public.meeting_recordings FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.meeting_recordings TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.meeting_recordings;

CREATE POLICY native_insert ON public.meeting_recordings FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.meeting_recordings TO closr_app;
DROP POLICY IF EXISTS native_update ON public.meeting_recordings;

CREATE POLICY native_update ON public.meeting_recordings FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.meeting_recordings TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.meeting_recordings;

CREATE POLICY native_delete ON public.meeting_recordings FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_can_access_owner(org_id,user_id)))) OR (org_id IS NULL AND account_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.integration_wecom_contacts TO closr_app;
DROP POLICY IF EXISTS native_read ON public.integration_wecom_contacts;
CREATE POLICY native_read ON public.integration_wecom_contacts FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.integration_wecom_contacts TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.integration_wecom_contacts;

CREATE POLICY native_insert ON public.integration_wecom_contacts FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.integration_wecom_contacts TO closr_app;
DROP POLICY IF EXISTS native_update ON public.integration_wecom_contacts;

CREATE POLICY native_update ON public.integration_wecom_contacts FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.integration_wecom_contacts TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.integration_wecom_contacts;

CREATE POLICY native_delete ON public.integration_wecom_contacts FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.integration_wecom_groups TO closr_app;
DROP POLICY IF EXISTS native_read ON public.integration_wecom_groups;
CREATE POLICY native_read ON public.integration_wecom_groups FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.integration_wecom_groups TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.integration_wecom_groups;

CREATE POLICY native_insert ON public.integration_wecom_groups FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.integration_wecom_groups TO closr_app;
DROP POLICY IF EXISTS native_update ON public.integration_wecom_groups;

CREATE POLICY native_update ON public.integration_wecom_groups FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.integration_wecom_groups TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.integration_wecom_groups;

CREATE POLICY native_delete ON public.integration_wecom_groups FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.opportunity_contacts TO closr_app;
DROP POLICY IF EXISTS native_read ON public.opportunity_contacts;
CREATE POLICY native_read ON public.opportunity_contacts FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.opportunity_contacts TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.opportunity_contacts;

CREATE POLICY native_insert ON public.opportunity_contacts FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.opportunity_contacts TO closr_app;
DROP POLICY IF EXISTS native_update ON public.opportunity_contacts;

CREATE POLICY native_update ON public.opportunity_contacts FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.opportunity_contacts TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.opportunity_contacts;

CREATE POLICY native_delete ON public.opportunity_contacts FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.contact_enrichment_log TO closr_app;
DROP POLICY IF EXISTS native_read ON public.contact_enrichment_log;
CREATE POLICY native_read ON public.contact_enrichment_log FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.contact_enrichment_log TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.contact_enrichment_log;

CREATE POLICY native_insert ON public.contact_enrichment_log FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.contact_enrichment_log TO closr_app;
DROP POLICY IF EXISTS native_update ON public.contact_enrichment_log;

CREATE POLICY native_update ON public.contact_enrichment_log FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.contact_enrichment_log TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.contact_enrichment_log;

CREATE POLICY native_delete ON public.contact_enrichment_log FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.rfps TO closr_app;
DROP POLICY IF EXISTS native_read ON public.rfps;
CREATE POLICY native_read ON public.rfps FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT INSERT ON public.rfps TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.rfps;

CREATE POLICY native_insert ON public.rfps FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT UPDATE ON public.rfps TO closr_app;
DROP POLICY IF EXISTS native_update ON public.rfps;

CREATE POLICY native_update ON public.rfps FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id))))) WITH CHECK (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT DELETE ON public.rfps TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.rfps;

CREATE POLICY native_delete ON public.rfps FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((account_id IS NOT NULL AND public.native_can_access_account(account_id,org_id)) OR (account_id IS NULL AND public.native_is_org_member(org_id)))));

GRANT SELECT ON public.rfp_documents TO closr_app;
DROP POLICY IF EXISTS native_read ON public.rfp_documents;
CREATE POLICY native_read ON public.rfp_documents FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.rfp_documents TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.rfp_documents;

CREATE POLICY native_insert ON public.rfp_documents FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.rfp_documents TO closr_app;
DROP POLICY IF EXISTS native_update ON public.rfp_documents;

CREATE POLICY native_update ON public.rfp_documents FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.rfp_documents TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.rfp_documents;

CREATE POLICY native_delete ON public.rfp_documents FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.rfp_milestones TO closr_app;
DROP POLICY IF EXISTS native_read ON public.rfp_milestones;
CREATE POLICY native_read ON public.rfp_milestones FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.rfp_milestones TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.rfp_milestones;

CREATE POLICY native_insert ON public.rfp_milestones FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)) AND (assigned_to IS NULL OR (org_id IS NULL AND assigned_to=auth.uid()) OR public.native_user_in_org(org_id,assigned_to)));

GRANT UPDATE ON public.rfp_milestones TO closr_app;
DROP POLICY IF EXISTS native_update ON public.rfp_milestones;

CREATE POLICY native_update ON public.rfp_milestones FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)) AND (assigned_to IS NULL OR (org_id IS NULL AND assigned_to=auth.uid()) OR public.native_user_in_org(org_id,assigned_to)));

GRANT DELETE ON public.rfp_milestones TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.rfp_milestones;

CREATE POLICY native_delete ON public.rfp_milestones FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.rfp_competitors TO closr_app;
DROP POLICY IF EXISTS native_read ON public.rfp_competitors;
CREATE POLICY native_read ON public.rfp_competitors FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.rfp_competitors TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.rfp_competitors;

CREATE POLICY native_insert ON public.rfp_competitors FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.rfp_competitors TO closr_app;
DROP POLICY IF EXISTS native_update ON public.rfp_competitors;

CREATE POLICY native_update ON public.rfp_competitors FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.rfp_competitors TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.rfp_competitors;

CREATE POLICY native_delete ON public.rfp_competitors FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.rfp_ai_analyses TO closr_app;
DROP POLICY IF EXISTS native_read ON public.rfp_ai_analyses;
CREATE POLICY native_read ON public.rfp_ai_analyses FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.rfp_ai_analyses TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.rfp_ai_analyses;

CREATE POLICY native_insert ON public.rfp_ai_analyses FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.rfp_ai_analyses TO closr_app;
DROP POLICY IF EXISTS native_update ON public.rfp_ai_analyses;

CREATE POLICY native_update ON public.rfp_ai_analyses FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.rfp_ai_analyses TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.rfp_ai_analyses;

CREATE POLICY native_delete ON public.rfp_ai_analyses FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.org_dashboard_configs TO closr_app;
DROP POLICY IF EXISTS native_read ON public.org_dashboard_configs;
CREATE POLICY native_read ON public.org_dashboard_configs FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.org_dashboard_configs TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.org_dashboard_configs;

CREATE POLICY native_insert ON public.org_dashboard_configs FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.org_dashboard_configs TO closr_app;
DROP POLICY IF EXISTS native_update ON public.org_dashboard_configs;

CREATE POLICY native_update ON public.org_dashboard_configs FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT DELETE ON public.org_dashboard_configs TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.org_dashboard_configs;

CREATE POLICY native_delete ON public.org_dashboard_configs FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_admin(org_id)));

GRANT SELECT ON public.import_jobs TO closr_app;
DROP POLICY IF EXISTS native_read ON public.import_jobs;
CREATE POLICY native_read ON public.import_jobs FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT INSERT ON public.import_jobs TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.import_jobs;

CREATE POLICY native_insert ON public.import_jobs FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT UPDATE ON public.import_jobs TO closr_app;
DROP POLICY IF EXISTS native_update ON public.import_jobs;

CREATE POLICY native_update ON public.import_jobs FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid())))) WITH CHECK (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))) AND (user_id IS NULL OR user_id = auth.uid() OR public.native_is_org_admin(org_id)));

GRANT DELETE ON public.import_jobs TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.import_jobs;

CREATE POLICY native_delete ON public.import_jobs FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (((public.native_is_org_member(org_id)) OR (org_id IS NULL AND user_id = auth.uid()))));

GRANT SELECT ON public.import_rows TO closr_app;
DROP POLICY IF EXISTS native_read ON public.import_rows;
CREATE POLICY native_read ON public.import_rows FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.import_rows TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.import_rows;

CREATE POLICY native_insert ON public.import_rows FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.import_rows TO closr_app;
DROP POLICY IF EXISTS native_update ON public.import_rows;

CREATE POLICY native_update ON public.import_rows FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.import_rows TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.import_rows;

CREATE POLICY native_delete ON public.import_rows FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.field_mappings TO closr_app;
DROP POLICY IF EXISTS native_read ON public.field_mappings;
CREATE POLICY native_read ON public.field_mappings FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.field_mappings TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.field_mappings;

CREATE POLICY native_insert ON public.field_mappings FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.field_mappings TO closr_app;
DROP POLICY IF EXISTS native_update ON public.field_mappings;

CREATE POLICY native_update ON public.field_mappings FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.field_mappings TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.field_mappings;

CREATE POLICY native_delete ON public.field_mappings FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.duplicate_candidates TO closr_app;
DROP POLICY IF EXISTS native_read ON public.duplicate_candidates;
CREATE POLICY native_read ON public.duplicate_candidates FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.duplicate_candidates TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.duplicate_candidates;

CREATE POLICY native_insert ON public.duplicate_candidates FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.duplicate_candidates TO closr_app;
DROP POLICY IF EXISTS native_update ON public.duplicate_candidates;

CREATE POLICY native_update ON public.duplicate_candidates FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.duplicate_candidates TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.duplicate_candidates;

CREATE POLICY native_delete ON public.duplicate_candidates FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.merge_decisions TO closr_app;
DROP POLICY IF EXISTS native_read ON public.merge_decisions;
CREATE POLICY native_read ON public.merge_decisions FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.merge_decisions TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.merge_decisions;

CREATE POLICY native_insert ON public.merge_decisions FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.merge_decisions TO closr_app;
DROP POLICY IF EXISTS native_update ON public.merge_decisions;

CREATE POLICY native_update ON public.merge_decisions FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.merge_decisions TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.merge_decisions;

CREATE POLICY native_delete ON public.merge_decisions FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.data_quality_findings TO closr_app;
DROP POLICY IF EXISTS native_read ON public.data_quality_findings;
CREATE POLICY native_read ON public.data_quality_findings FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.data_quality_findings TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.data_quality_findings;

CREATE POLICY native_insert ON public.data_quality_findings FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.data_quality_findings TO closr_app;
DROP POLICY IF EXISTS native_update ON public.data_quality_findings;

CREATE POLICY native_update ON public.data_quality_findings FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.data_quality_findings TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.data_quality_findings;

CREATE POLICY native_delete ON public.data_quality_findings FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT SELECT ON public.engine_source_records TO closr_app;
DROP POLICY IF EXISTS native_read ON public.engine_source_records;
CREATE POLICY native_read ON public.engine_source_records FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT INSERT ON public.engine_source_records TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.engine_source_records;

CREATE POLICY native_insert ON public.engine_source_records FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT UPDATE ON public.engine_source_records TO closr_app;
DROP POLICY IF EXISTS native_update ON public.engine_source_records;

CREATE POLICY native_update ON public.engine_source_records FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT DELETE ON public.engine_source_records TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.engine_source_records;

CREATE POLICY native_delete ON public.engine_source_records FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT SELECT ON public.engine_evidence_refs TO closr_app;
DROP POLICY IF EXISTS native_read ON public.engine_evidence_refs;
CREATE POLICY native_read ON public.engine_evidence_refs FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT INSERT ON public.engine_evidence_refs TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.engine_evidence_refs;

CREATE POLICY native_insert ON public.engine_evidence_refs FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT UPDATE ON public.engine_evidence_refs TO closr_app;
DROP POLICY IF EXISTS native_update ON public.engine_evidence_refs;

CREATE POLICY native_update ON public.engine_evidence_refs FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT DELETE ON public.engine_evidence_refs TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.engine_evidence_refs;

CREATE POLICY native_delete ON public.engine_evidence_refs FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT SELECT ON public.engine_judgments TO closr_app;
DROP POLICY IF EXISTS native_read ON public.engine_judgments;
CREATE POLICY native_read ON public.engine_judgments FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT INSERT ON public.engine_judgments TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.engine_judgments;

CREATE POLICY native_insert ON public.engine_judgments FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT UPDATE ON public.engine_judgments TO closr_app;
DROP POLICY IF EXISTS native_update ON public.engine_judgments;

CREATE POLICY native_update ON public.engine_judgments FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT DELETE ON public.engine_judgments TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.engine_judgments;

CREATE POLICY native_delete ON public.engine_judgments FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT SELECT ON public.engine_win_gaps TO closr_app;
DROP POLICY IF EXISTS native_read ON public.engine_win_gaps;
CREATE POLICY native_read ON public.engine_win_gaps FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT INSERT ON public.engine_win_gaps TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.engine_win_gaps;

CREATE POLICY native_insert ON public.engine_win_gaps FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT UPDATE ON public.engine_win_gaps TO closr_app;
DROP POLICY IF EXISTS native_update ON public.engine_win_gaps;

CREATE POLICY native_update ON public.engine_win_gaps FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT DELETE ON public.engine_win_gaps TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.engine_win_gaps;

CREATE POLICY native_delete ON public.engine_win_gaps FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT SELECT ON public.engine_moves TO closr_app;
DROP POLICY IF EXISTS native_read ON public.engine_moves;
CREATE POLICY native_read ON public.engine_moves FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT INSERT ON public.engine_moves TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.engine_moves;

CREATE POLICY native_insert ON public.engine_moves FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT UPDATE ON public.engine_moves TO closr_app;
DROP POLICY IF EXISTS native_update ON public.engine_moves;

CREATE POLICY native_update ON public.engine_moves FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

GRANT DELETE ON public.engine_moves TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.engine_moves;

CREATE POLICY native_delete ON public.engine_moves FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_can_access_tenant_text(tenant_id)));

-- engine_audit_events: server-only; no browser role grant.

GRANT SELECT ON public.play_relationships TO closr_app;
DROP POLICY IF EXISTS native_read ON public.play_relationships;
CREATE POLICY native_read ON public.play_relationships FOR SELECT TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT INSERT ON public.play_relationships TO closr_app;
DROP POLICY IF EXISTS native_insert ON public.play_relationships;

CREATE POLICY native_insert ON public.play_relationships FOR INSERT TO closr_app WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT UPDATE ON public.play_relationships TO closr_app;
DROP POLICY IF EXISTS native_update ON public.play_relationships;

CREATE POLICY native_update ON public.play_relationships FOR UPDATE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id))) WITH CHECK (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

GRANT DELETE ON public.play_relationships TO closr_app;
DROP POLICY IF EXISTS native_delete ON public.play_relationships;

CREATE POLICY native_delete ON public.play_relationships FOR DELETE TO closr_app USING (auth.uid() IS NOT NULL AND (public.native_is_org_member(org_id)));

-- Creator/tenant identity cannot be reassigned through a generic browser update.
CREATE OR REPLACE FUNCTION public.native_protect_task_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user='closr_app' THEN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
   RAISE EXCEPTION 'Task organization cannot be changed' USING ERRCODE='42501';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT public.native_is_org_admin(OLD.org_id) THEN
   RAISE EXCEPTION 'Task creator cannot be changed' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS native_protect_task_identity ON public.tasks;
CREATE TRIGGER native_protect_task_identity BEFORE UPDATE ON public.tasks
 FOR EACH ROW EXECUTE FUNCTION public.native_protect_task_identity();
