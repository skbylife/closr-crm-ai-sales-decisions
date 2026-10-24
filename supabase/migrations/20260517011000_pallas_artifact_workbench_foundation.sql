-- Pallas Artifact Workbench foundation
-- Stores AI artifacts and user-confirmable action proposals without changing existing business tables.
-- Business writes still execute through the existing /api/agent/execute-tools dispatch layer.

create table if not exists pallas_artifacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in (
    'customer_research_card',
    'strategic_play_action_board',
    'communication_draft_preview',
    'evidence_pack',
    'ask_data_result'
  )),
  title text not null,
  entity_type text not null check (entity_type in (
    'account',
    'contact',
    'opportunity',
    'strategic_play',
    'task',
    'global'
  )),
  entity_id text,
  account_id text,
  contact_id text,
  opportunity_id text,
  strategic_play_id uuid,
  data jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pallas_artifacts_account_org_fk foreign key (account_id, org_id) references accounts(id, org_id) on delete set null,
  constraint pallas_artifacts_contact_org_fk foreign key (contact_id, org_id) references contacts(id, org_id) on delete set null,
  constraint pallas_artifacts_opportunity_org_fk foreign key (opportunity_id, org_id) references opportunities(id, org_id) on delete set null,
  constraint pallas_artifacts_strategic_play_org_fk foreign key (strategic_play_id, org_id) references strategic_plays(id, org_id) on delete set null
);

create unique index if not exists pallas_artifacts_id_org_id_uidx on pallas_artifacts(id, org_id);
create index if not exists idx_pallas_artifacts_org_context on pallas_artifacts(org_id, entity_type, entity_id, created_at desc);
create index if not exists idx_pallas_artifacts_account on pallas_artifacts(org_id, account_id, created_at desc);
create index if not exists idx_pallas_artifacts_kind on pallas_artifacts(org_id, kind, created_at desc);

create table if not exists pallas_artifact_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  artifact_id uuid not null,
  version integer not null,
  data jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pallas_artifact_versions_artifact_org_fk foreign key (artifact_id, org_id) references pallas_artifacts(id, org_id) on delete cascade,
  unique (artifact_id, version)
);

create index if not exists idx_pallas_artifact_versions_artifact on pallas_artifact_versions(artifact_id, version desc);

create table if not exists pallas_action_proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  artifact_id uuid,
  conversation_id text not null,
  entity_type text not null check (entity_type in (
    'account',
    'contact',
    'opportunity',
    'strategic_play',
    'task',
    'global'
  )),
  entity_id text,
  account_id text,
  contact_id text,
  opportunity_id text,
  strategic_play_id uuid,
  status text not null default 'draft' check (status in (
    'draft',
    'awaiting_confirmation',
    'confirmed',
    'executing',
    'succeeded',
    'failed',
    'rejected',
    'expired'
  )),
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'external')),
  actions jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  result_summary text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pallas_action_proposals_artifact_org_fk foreign key (artifact_id, org_id) references pallas_artifacts(id, org_id) on delete set null,
  constraint pallas_action_proposals_account_org_fk foreign key (account_id, org_id) references accounts(id, org_id) on delete set null,
  constraint pallas_action_proposals_contact_org_fk foreign key (contact_id, org_id) references contacts(id, org_id) on delete set null,
  constraint pallas_action_proposals_opportunity_org_fk foreign key (opportunity_id, org_id) references opportunities(id, org_id) on delete set null,
  constraint pallas_action_proposals_strategic_play_org_fk foreign key (strategic_play_id, org_id) references strategic_plays(id, org_id) on delete set null
);

create unique index if not exists pallas_action_proposals_id_org_id_uidx on pallas_action_proposals(id, org_id);
create index if not exists idx_pallas_action_proposals_org_status on pallas_action_proposals(org_id, status, created_at desc);
create index if not exists idx_pallas_action_proposals_context on pallas_action_proposals(org_id, entity_type, entity_id, created_at desc);
create index if not exists idx_pallas_action_proposals_artifact on pallas_action_proposals(artifact_id, created_at desc);

create table if not exists pallas_tool_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  proposal_id uuid not null,
  tool_name text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pallas_tool_runs_proposal_org_fk foreign key (proposal_id, org_id) references pallas_action_proposals(id, org_id) on delete cascade
);

create index if not exists idx_pallas_tool_runs_proposal on pallas_tool_runs(proposal_id, created_at desc);
create index if not exists idx_pallas_tool_runs_org_status on pallas_tool_runs(org_id, status, created_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_pallas_artifacts_updated_at') then
    create trigger trg_pallas_artifacts_updated_at before update on pallas_artifacts
      for each row execute function set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_pallas_action_proposals_updated_at') then
    create trigger trg_pallas_action_proposals_updated_at before update on pallas_action_proposals
      for each row execute function set_updated_at();
  end if;
end $$;

alter table pallas_artifacts enable row level security;
alter table pallas_artifact_versions enable row level security;
alter table pallas_action_proposals enable row level security;
alter table pallas_tool_runs enable row level security;

drop policy if exists "pallas_artifacts_org_members" on pallas_artifacts;
create policy "pallas_artifacts_org_members" on pallas_artifacts for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

drop policy if exists "pallas_artifact_versions_org_members" on pallas_artifact_versions;
create policy "pallas_artifact_versions_org_members" on pallas_artifact_versions for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

drop policy if exists "pallas_action_proposals_org_members" on pallas_action_proposals;
create policy "pallas_action_proposals_org_members" on pallas_action_proposals for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

drop policy if exists "pallas_tool_runs_org_members" on pallas_tool_runs;
create policy "pallas_tool_runs_org_members" on pallas_tool_runs for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
