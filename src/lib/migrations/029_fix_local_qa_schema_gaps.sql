-- Fix local/demo QA schema gaps exposed by Relationship Intelligence login-state QA.
-- Keeps org membership reads non-recursive and aligns contacts reset schema with app hydration columns.

drop policy if exists "org_memberships_rls" on org_memberships;
create policy "org_memberships_rls" on org_memberships for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table contacts
  add column if not exists attitude_trend text,
  add column if not exists job_level integer,
  add column if not exists role_confidence numeric(5,2),
  add column if not exists role_updated_at timestamptz,
  add column if not exists role_source text;

create index if not exists idx_contacts_role_confidence
  on contacts(org_id, role, role_confidence);

create index if not exists idx_contacts_job_level
  on contacts(org_id, job_level)
  where job_level is not null;


alter table accounts
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists visibility text default 'org';

create index if not exists idx_accounts_owner_id on accounts(owner_id);
create index if not exists idx_accounts_visibility on accounts(visibility);


alter table opportunities
  add column if not exists visibility text default 'org';

alter table intel_items
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table email_decodes
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_opportunities_visibility on opportunities(visibility);
create index if not exists idx_intel_items_created_by on intel_items(created_by);
create index if not exists idx_email_decodes_user_id on email_decodes(user_id);


alter table org_memberships
  add column if not exists role_level integer;

update org_memberships
set role_level = coalesce(role_level, job_level, case when role in ('owner', 'admin') then 2 else 0 end);


alter table contact_coverage_assignments
  drop constraint if exists contact_coverage_assignments_relationship_status_check;

alter table contact_coverage_assignments
  add constraint contact_coverage_assignments_relationship_status_check
  check (relationship_status in ('unknown', 'none', 'cold', 'warming', 'introduced', 'engaged', 'familiar', 'trusted', 'can_introduce', 'champion', 'blocker', 'risk'));
