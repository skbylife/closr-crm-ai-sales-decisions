-- CRM P0: persistent account/opportunity/contact timeline facts.
-- Dynamic workbench aggregation remains a fallback for existing data.

create table if not exists timeline_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  account_id text references accounts(id) on delete cascade,
  opportunity_id text references opportunities(id) on delete cascade,
  contact_id text references contacts(id) on delete set null,
  type text not null check (type in ('email', 'meeting', 'call', 'chat', 'intel', 'task', 'stage_change', 'close_date', 'document', 'note')),
  occurred_at timestamptz not null default now(),
  title text not null,
  actor text,
  detail text,
  source_table text,
  source_row_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists timeline_event_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  event_id uuid not null references timeline_events(id) on delete cascade,
  entity_type text not null check (entity_type in ('account', 'opportunity', 'contact')),
  entity_id text not null,
  created_at timestamptz not null default now(),
  unique (event_id, entity_type, entity_id)
);

create table if not exists opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  opportunity_id text not null references opportunities(id) on delete cascade,
  old_stage text,
  new_stage text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);

create table if not exists opportunity_close_date_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  opportunity_id text not null references opportunities(id) on delete cascade,
  old_close_date text,
  new_close_date text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);

create index if not exists idx_timeline_events_org_time on timeline_events(org_id, occurred_at desc);
create index if not exists idx_timeline_events_org_opp_time on timeline_events(org_id, opportunity_id, occurred_at desc);
create index if not exists idx_timeline_events_org_account_time on timeline_events(org_id, account_id, occurred_at desc);
create index if not exists idx_timeline_event_links_entity on timeline_event_links(org_id, entity_type, entity_id);
create index if not exists idx_stage_history_org_opp_time on opportunity_stage_history(org_id, opportunity_id, changed_at desc);
create index if not exists idx_close_date_history_org_opp_time on opportunity_close_date_history(org_id, opportunity_id, changed_at desc);

alter table timeline_events enable row level security;
alter table timeline_event_links enable row level security;
alter table opportunity_stage_history enable row level security;
alter table opportunity_close_date_history enable row level security;

drop policy if exists "timeline_events_org_members" on timeline_events;
create policy "timeline_events_org_members" on timeline_events for all using (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
) with check (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
);

drop policy if exists "timeline_event_links_org_members" on timeline_event_links;
create policy "timeline_event_links_org_members" on timeline_event_links for all using (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
) with check (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
);

drop policy if exists "opportunity_stage_history_org_members" on opportunity_stage_history;
create policy "opportunity_stage_history_org_members" on opportunity_stage_history for all using (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
) with check (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
);

drop policy if exists "opportunity_close_date_history_org_members" on opportunity_close_date_history;
create policy "opportunity_close_date_history_org_members" on opportunity_close_date_history for all using (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
) with check (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
);
