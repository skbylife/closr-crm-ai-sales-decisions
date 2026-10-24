-- CRM P0: persistent contact roles per opportunity.
-- Additive only. Existing opportunity workbench inference remains the fallback.

create table if not exists contact_opportunity_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id text not null references contacts(id) on delete cascade,
  opportunity_id text not null references opportunities(id) on delete cascade,
  role_type text not null default 'unknown' check (role_type in (
    'decision_maker',
    'economic_buyer',
    'champion',
    'technical_evaluator',
    'influencer',
    'external_advisor',
    'consultant',
    'channel_influencer',
    'blocker',
    'end_user',
    'procurement',
    'legal',
    'project_manager',
    'executive_sponsor',
    'gate_keeper',
    'coach',
    'committee_member',
    'it_admin',
    'operations',
    'finance',
    'contact',
    'unknown'
  )),
  influence_level text not null default 'unknown' check (influence_level in ('high', 'medium', 'low', 'unknown')),
  stance text not null default 'unknown' check (stance in ('supportive', 'neutral', 'risk', 'unknown')),
  engagement_status text not null default 'missing' check (engagement_status in ('covered', 'needs_touch', 'missing')),
  last_engaged_at timestamptz,
  relationship_owner_id uuid references auth.users(id) on delete set null,
  source_evidence_ids text[] not null default '{}',
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, opportunity_id)
);

create index if not exists idx_contact_opportunity_roles_org_opp on contact_opportunity_roles(org_id, opportunity_id);
create index if not exists idx_contact_opportunity_roles_org_contact on contact_opportunity_roles(org_id, contact_id);
create index if not exists idx_contact_opportunity_roles_owner on contact_opportunity_roles(org_id, relationship_owner_id);

alter table contact_opportunity_roles enable row level security;

drop policy if exists "contact_opportunity_roles_select" on contact_opportunity_roles;
create policy "contact_opportunity_roles_select" on contact_opportunity_roles for select using (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
);

drop policy if exists "contact_opportunity_roles_insert" on contact_opportunity_roles;
create policy "contact_opportunity_roles_insert" on contact_opportunity_roles for insert with check (
  created_by = auth.uid()
  and org_id in (select org_id from org_memberships where user_id = auth.uid())
);

drop policy if exists "contact_opportunity_roles_update" on contact_opportunity_roles;
create policy "contact_opportunity_roles_update" on contact_opportunity_roles for update using (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
  and (
    get_my_org_role(org_id) in ('owner', 'admin')
    or created_by = auth.uid()
    or relationship_owner_id = auth.uid()
    or created_by in (select get_team_user_ids(org_id))
    or relationship_owner_id in (select get_team_user_ids(org_id))
  )
);

drop policy if exists "contact_opportunity_roles_delete" on contact_opportunity_roles;
create policy "contact_opportunity_roles_delete" on contact_opportunity_roles for delete using (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
  and (
    get_my_org_role(org_id) in ('owner', 'admin')
    or created_by = auth.uid()
    or relationship_owner_id = auth.uid()
  )
);
