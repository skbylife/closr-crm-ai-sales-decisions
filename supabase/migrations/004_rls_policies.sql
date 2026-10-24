-- 004_rls_policies.sql
-- Row Level Security policies for all tables.
-- Idempotent: drops existing policies before recreating them.

-- Enable RLS on all tables
alter table organizations enable row level security;
alter table teams enable row level security;
alter table org_memberships enable row level security;
alter table org_invitations enable row level security;
alter table accounts enable row level security;
alter table contacts enable row level security;
alter table opportunities enable row level security;
alter table intel_items enable row level security;
alter table email_decodes enable row level security;
alter table composed_emails enable row level security;
alter table meeting_preps enable row level security;
alter table discovery_notes enable row level security;
alter table knowledge_items enable row level security;
alter table user_settings enable row level security;
alter table tasks enable row level security;

-- -----------------------------------------------------------------------
-- Organization tables: users can see orgs they belong to
-- -----------------------------------------------------------------------

drop policy if exists "organizations_rls" on organizations;
create policy "organizations_rls" on organizations for all
  using (id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (id in (select org_id from org_memberships where user_id = auth.uid()));

drop policy if exists "teams_rls" on teams;
create policy "teams_rls" on teams for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

drop policy if exists "org_memberships_rls" on org_memberships;
create policy "org_memberships_rls" on org_memberships for all
  using (org_id in (select om.org_id from org_memberships om where om.user_id = auth.uid()))
  with check (org_id in (select om.org_id from org_memberships om where om.user_id = auth.uid()));

drop policy if exists "org_invitations_rls" on org_invitations;
create policy "org_invitations_rls" on org_invitations for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

-- -----------------------------------------------------------------------
-- Business data: org_id isolation with user_id fallback for unmigrated data
-- -----------------------------------------------------------------------

drop policy if exists "accounts_rls" on accounts;
create policy "accounts_rls" on accounts for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

drop policy if exists "contacts_rls" on contacts;
create policy "contacts_rls" on contacts for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

drop policy if exists "opportunities_rls" on opportunities;
create policy "opportunities_rls" on opportunities for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

drop policy if exists "intel_items_rls" on intel_items;
create policy "intel_items_rls" on intel_items for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

drop policy if exists "email_decodes_rls" on email_decodes;
create policy "email_decodes_rls" on email_decodes for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

drop policy if exists "composed_emails_rls" on composed_emails;
create policy "composed_emails_rls" on composed_emails for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

drop policy if exists "meeting_preps_rls" on meeting_preps;
create policy "meeting_preps_rls" on meeting_preps for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

drop policy if exists "discovery_notes_rls" on discovery_notes;
create policy "discovery_notes_rls" on discovery_notes for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

drop policy if exists "knowledge_items_rls" on knowledge_items;
create policy "knowledge_items_rls" on knowledge_items for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

drop policy if exists "user_settings_rls" on user_settings;
create policy "user_settings_rls" on user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "tasks_rls" on tasks;
create policy "tasks_rls" on tasks for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );
