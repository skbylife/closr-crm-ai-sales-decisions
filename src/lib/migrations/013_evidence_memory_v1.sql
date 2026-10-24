-- 013_evidence_memory_v1.sql
-- Additive schema for Evidence Panel + Account Memory Engine V1.

create table if not exists source_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  account_id text references accounts(id) on delete cascade,
  source_kind text not null,
  source_table text,
  source_row_id text not null,
  title text,
  summary text,
  occurred_at timestamptz default now(),
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  unique (org_id, source_kind, source_row_id)
);

create table if not exists account_memory_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  account_id text references accounts(id) on delete cascade,
  narrative_summary text not null,
  momentum jsonb not null default '{}',
  people jsonb not null default '[]',
  tensions jsonb not null default '[]',
  timeline_highlights jsonb not null default '[]',
  snapshot_json jsonb not null default '{}',
  computed_at timestamptz default now()
);

create table if not exists memory_conflicts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  account_id text references accounts(id) on delete cascade,
  summary text not null,
  status text not null default 'open',
  source_ids text[] default '{}',
  detected_at timestamptz default now(),
  resolved_at timestamptz
);

create index if not exists idx_source_records_org_account on source_records(org_id, account_id, occurred_at desc);
create index if not exists idx_account_memory_snapshots_org_account on account_memory_snapshots(org_id, account_id, computed_at desc);
create index if not exists idx_memory_conflicts_org_account on memory_conflicts(org_id, account_id, detected_at desc);
