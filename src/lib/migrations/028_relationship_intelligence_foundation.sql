-- Relationship Intelligence Foundation
-- Keep in sync with supabase/migrations/20260514025000_relationship_intelligence_foundation.sql.

create unique index if not exists accounts_id_org_id_uidx on accounts(id, org_id);
create unique index if not exists contacts_id_org_id_uidx on contacts(id, org_id);
create unique index if not exists opportunities_id_org_id_uidx on opportunities(id, org_id);

-- Align reset/deploy schema with the Decode pipeline context used by forwarded
-- email intake. Some historical app migrations added these columns outside the
-- Supabase migration chain, so the relationship API must not depend on a column
-- that fresh reset schemas do not create.
alter table email_decodes
  add column if not exists signal_source text,
  add column if not exists analysis_goal text,
  add column if not exists signal_context text;

alter table email_decodes drop constraint if exists email_decodes_signal_source_check;
alter table email_decodes add constraint email_decodes_signal_source_check
  check (
    signal_source is null
    or signal_source in ('email', 'meeting', 'call', 'chat', 'intel', 'other', 'forwarded_email')
  );

alter table email_decodes drop constraint if exists email_decodes_analysis_goal_check;
alter table email_decodes add constraint email_decodes_analysis_goal_check
  check (
    analysis_goal is null
    or analysis_goal in ('auto', 'attitude', 'risk', 'reply', 'deal_update', 'next_action')
  );

create table if not exists relationship_signals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  account_id text not null,
  opportunity_id text,
  contact_id text,
  actor_user_id uuid references auth.users(id) on delete set null,
  signal_kind text not null check (signal_kind in ('forwarded_email_decode', 'email_interaction', 'meeting', 'manual_note', 'coverage_update', 'profile_hint')),
  valence text not null default 'neutral' check (valence in ('positive', 'neutral', 'negative', 'mixed', 'unknown')),
  strength integer not null default 20 check (strength >= 0 and strength <= 100),
  confidence numeric(4,3) not null default 0.500 check (confidence >= 0 and confidence <= 1),
  summary text not null,
  quote_text text,
  source_record_id uuid references source_records(id) on delete set null,
  source_table text,
  source_row_id text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint relationship_signals_account_org_fk foreign key (account_id, org_id) references accounts(id, org_id) on delete cascade,
  constraint relationship_signals_contact_org_fk foreign key (contact_id, org_id) references contacts(id, org_id) on delete cascade,
  constraint relationship_signals_opportunity_org_fk foreign key (opportunity_id, org_id) references opportunities(id, org_id) on delete cascade
);

create unique index if not exists relationship_signals_dedupe_uidx
  on relationship_signals(org_id, source_table, source_row_id, signal_kind, coalesce(contact_id, ''), coalesce(actor_user_id::text, ''))
  where source_table is not null and source_row_id is not null;
create unique index if not exists relationship_signals_id_org_id_uidx on relationship_signals(id, org_id);
create index if not exists idx_relationship_signals_org_account on relationship_signals(org_id, account_id, occurred_at desc);
create index if not exists idx_relationship_signals_contact on relationship_signals(org_id, contact_id, occurred_at desc);
create index if not exists idx_relationship_signals_actor on relationship_signals(org_id, actor_user_id, occurred_at desc);

create table if not exists relationship_edges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  account_id text not null,
  opportunity_id text,
  from_entity_type text not null default 'user' check (from_entity_type in ('user', 'contact', 'team', 'unknown')),
  from_user_id uuid references auth.users(id) on delete set null,
  from_contact_id text,
  to_contact_id text not null,
  edge_type text not null default 'communication' check (edge_type in ('communication', 'trust', 'influence', 'coverage', 'risk')),
  relationship_status text not null default 'unknown' check (relationship_status in ('unknown', 'none', 'introduced', 'engaged', 'familiar', 'trusted', 'can_introduce', 'risk')),
  strength integer not null default 0 check (strength >= 0 and strength <= 100),
  trend text not null default 'unknown' check (trend in ('rising', 'steady', 'cooling', 'stale', 'unknown')),
  confidence numeric(4,3) not null default 0.000 check (confidence >= 0 and confidence <= 1),
  signal_count integer not null default 0 check (signal_count >= 0),
  last_signal_at timestamptz,
  evidence_refs jsonb not null default '[]',
  computed_at timestamptz not null default now(),
  stale_after timestamptz,
  status_flags text[] not null default '{}',
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  constraint relationship_edges_account_org_fk foreign key (account_id, org_id) references accounts(id, org_id) on delete cascade,
  constraint relationship_edges_opportunity_org_fk foreign key (opportunity_id, org_id) references opportunities(id, org_id) on delete cascade,
  constraint relationship_edges_from_contact_org_fk foreign key (from_contact_id, org_id) references contacts(id, org_id) on delete cascade,
  constraint relationship_edges_to_contact_org_fk foreign key (to_contact_id, org_id) references contacts(id, org_id) on delete cascade
);

create unique index if not exists relationship_edges_user_contact_uidx
  on relationship_edges(org_id, account_id, from_user_id, to_contact_id, edge_type)
  where from_user_id is not null and from_contact_id is null;
create unique index if not exists relationship_edges_contact_contact_uidx
  on relationship_edges(org_id, account_id, from_contact_id, to_contact_id, edge_type)
  where from_contact_id is not null;
create index if not exists idx_relationship_edges_org_account on relationship_edges(org_id, account_id, computed_at desc);
create index if not exists idx_relationship_edges_to_contact on relationship_edges(org_id, to_contact_id);
create index if not exists idx_relationship_edges_from_user on relationship_edges(org_id, from_user_id);

alter table contact_coverage_assignments
  add column if not exists coverage_health text not null default 'unknown' check (coverage_health in ('unknown', 'healthy', 'thin', 'stale', 'gap', 'risk', 'needs_review')),
  add column if not exists desired_relationship_status text check (desired_relationship_status in ('unknown', 'introduced', 'engaged', 'familiar', 'trusted', 'can_introduce', 'champion')),
  add column if not exists cadence_days integer check (cadence_days is null or cadence_days > 0),
  add column if not exists last_touch_at timestamptz,
  add column if not exists next_touch_due_at timestamptz,
  add column if not exists last_signal_id uuid references relationship_signals(id) on delete set null,
  add column if not exists confidence numeric(4,3) not null default 0.000 check (confidence >= 0 and confidence <= 1),
  add column if not exists risk_reasons jsonb not null default '[]',
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_contact_coverage_assignments_health on contact_coverage_assignments(org_id, account_id, coverage_health);
create index if not exists idx_contact_coverage_assignments_next_touch on contact_coverage_assignments(org_id, next_touch_due_at);
create index if not exists idx_contact_coverage_assignments_last_signal on contact_coverage_assignments(last_signal_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_relationship_edges_updated_at') then
    create trigger trg_relationship_edges_updated_at before update on relationship_edges
      for each row execute function set_updated_at();
  end if;
end $$;

alter table relationship_signals enable row level security;
alter table relationship_edges enable row level security;

drop policy if exists "relationship_signals_org_members" on relationship_signals;
create policy "relationship_signals_org_members" on relationship_signals for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

drop policy if exists "relationship_edges_org_members" on relationship_edges;
create policy "relationship_edges_org_members" on relationship_edges for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

-- Outcome learning intentionally deferred until product semantics stabilize.
-- TODO(relationship-intelligence): add relationship_outcomes once Next Best Move feedback is wired.
