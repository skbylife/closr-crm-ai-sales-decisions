-- CRM P1 Leads Persistence: org-scoped lead intake and conversion trace.
-- Additive only. Conversion writes continue to existing accounts/contacts/opportunities tables.

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,
  company_name text not null,
  contact_name text not null,
  email text,
  phone text,
  title text,
  source text not null default 'manual',
  need text not null,
  estimated_value numeric not null default 0,
  currency text not null default 'CNY',
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'new' check (status in ('new', 'qualified', 'nurture', 'disqualified', 'converted')),
  next_step text,
  notes text,
  converted_at timestamptz,
  converted_account_id text references accounts(id) on delete set null,
  converted_contact_id text references contacts(id) on delete set null,
  converted_opportunity_id text references opportunities(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_org_status_updated on leads(org_id, status, updated_at desc);
create index if not exists idx_leads_org_owner on leads(org_id, owner_id);
create index if not exists idx_leads_org_email on leads(org_id, lower(email)) where email is not null;
create index if not exists idx_leads_org_company on leads(org_id, lower(company_name));

alter table leads enable row level security;

drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads for select using (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
  and (
    get_my_org_role(org_id) in ('owner', 'admin')
    or user_id = auth.uid()
    or owner_id = auth.uid()
    or user_id in (select get_team_user_ids(org_id))
    or owner_id in (select get_team_user_ids(org_id))
  )
);

drop policy if exists "leads_insert" on leads;
create policy "leads_insert" on leads for insert with check (
  user_id = auth.uid()
  and org_id in (select org_id from org_memberships where user_id = auth.uid())
);

drop policy if exists "leads_update" on leads;
create policy "leads_update" on leads for update using (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
  and (
    get_my_org_role(org_id) in ('owner', 'admin')
    or user_id = auth.uid()
    or owner_id = auth.uid()
    or user_id in (select get_team_user_ids(org_id))
    or owner_id in (select get_team_user_ids(org_id))
  )
);

drop policy if exists "leads_delete" on leads;
create policy "leads_delete" on leads for delete using (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
  and (
    get_my_org_role(org_id) in ('owner', 'admin')
    or user_id = auth.uid()
    or owner_id = auth.uid()
  )
);
