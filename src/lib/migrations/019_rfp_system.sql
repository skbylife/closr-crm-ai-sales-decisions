-- ═══════════════════════════════════════════════════════════════════════
-- Migration 019: RFP System (招投标管理)
-- ═══════════════════════════════════════════════════════════════════════
-- Additive only. All IF NOT EXISTS / idempotent.
-- 5 tables: rfps, rfp_documents, rfp_milestones, rfp_competitors, rfp_ai_analyses

-- ─── 1. rfps — Core RFP table ──────────────────────────────────────────

create table if not exists rfps (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references organizations(id) on delete cascade not null,
  opportunity_id text not null,
  account_id     text references accounts(id) on delete cascade not null,
  linked_play_id uuid references strategic_plays(id) on delete set null,
  title          text not null,
  issuer         text not null default '',
  issued_date    date,
  due_date       date,
  status         text not null default 'identified',
  budget         numeric(18,2),
  currency       text not null default 'CNY',
  requirements   jsonb not null default '[]',
  notes          text not null default '',
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

comment on column rfps.status is 'identified|preparing|submitted|shortlisted|won|lost|no_bid';
comment on column rfps.requirements is 'JSON array of requirement strings extracted from RFP docs';

create index if not exists idx_rfps_org_account
  on rfps(org_id, account_id);
create index if not exists idx_rfps_org_opportunity
  on rfps(org_id, opportunity_id);
create index if not exists idx_rfps_org_status
  on rfps(org_id, status) where status not in ('won', 'lost', 'no_bid');
create index if not exists idx_rfps_due_date
  on rfps(org_id, due_date) where due_date is not null;
create index if not exists idx_rfps_linked_play
  on rfps(linked_play_id) where linked_play_id is not null;

alter table rfps enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'rfps_org_rls') then
    create policy "rfps_org_rls" on rfps for all
      using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
      with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
  end if;
end $$;


-- ─── 2. rfp_documents — Document metadata ──────────────────────────────

create table if not exists rfp_documents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references organizations(id) on delete cascade not null,
  rfp_id      uuid references rfps(id) on delete cascade not null,
  name        text not null,
  doc_type    text not null default 'other',
  url         text,
  file_size   bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);

comment on column rfp_documents.doc_type is 'rfp|response|clarification|amendment|other';

create index if not exists idx_rfp_documents_rfp
  on rfp_documents(org_id, rfp_id);

alter table rfp_documents enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'rfp_documents_org_rls') then
    create policy "rfp_documents_org_rls" on rfp_documents for all
      using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
      with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
  end if;
end $$;


-- ─── 3. rfp_milestones — Milestone tracking ────────────────────────────

create table if not exists rfp_milestones (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references organizations(id) on delete cascade not null,
  rfp_id      uuid references rfps(id) on delete cascade not null,
  title       text not null,
  due_date    date,
  status      text not null default 'pending',
  assigned_to uuid references auth.users(id) on delete set null,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

comment on column rfp_milestones.status is 'pending|completed|overdue';

create index if not exists idx_rfp_milestones_rfp
  on rfp_milestones(org_id, rfp_id);
create index if not exists idx_rfp_milestones_status
  on rfp_milestones(org_id, status) where status in ('pending', 'overdue');
create index if not exists idx_rfp_milestones_due
  on rfp_milestones(org_id, due_date) where status = 'pending';

alter table rfp_milestones enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'rfp_milestones_org_rls') then
    create policy "rfp_milestones_org_rls" on rfp_milestones for all
      using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
      with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
  end if;
end $$;


-- ─── 4. rfp_competitors — Structured competitor intelligence ────────────

create table if not exists rfp_competitors (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid references organizations(id) on delete cascade not null,
  rfp_id          uuid references rfps(id) on delete cascade not null,
  name            text not null,
  strengths       jsonb not null default '[]',
  weaknesses      jsonb not null default '[]',
  estimated_price numeric(18,2),
  win_probability numeric(5,2),
  intel_source    text,
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

comment on column rfp_competitors.strengths is 'JSON array of strength strings';
comment on column rfp_competitors.weaknesses is 'JSON array of weakness strings';
comment on column rfp_competitors.win_probability is '0.00-1.00 estimated probability';

create index if not exists idx_rfp_competitors_rfp
  on rfp_competitors(org_id, rfp_id);

alter table rfp_competitors enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'rfp_competitors_org_rls') then
    create policy "rfp_competitors_org_rls" on rfp_competitors for all
      using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
      with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
  end if;
end $$;


-- ─── 5. rfp_ai_analyses — Append-only AI analysis results ──────────────

create table if not exists rfp_ai_analyses (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid references organizations(id) on delete cascade not null,
  rfp_id               uuid references rfps(id) on delete cascade not null,
  analysis_type        text not null default 'full',
  win_probability      numeric(5,2),
  strengths            jsonb not null default '[]',
  weaknesses           jsonb not null default '[]',
  recommendations      jsonb not null default '[]',
  competitor_analysis  text,
  raw_output           jsonb,
  ai_model             text,
  created_at           timestamptz default now()
);

comment on column rfp_ai_analyses.analysis_type is 'full|quick|competitor_focused|requirement_gap';
comment on column rfp_ai_analyses.raw_output is 'Complete AI response for audit trail';

create index if not exists idx_rfp_ai_analyses_rfp
  on rfp_ai_analyses(org_id, rfp_id, created_at desc);

alter table rfp_ai_analyses enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'rfp_ai_analyses_org_rls') then
    create policy "rfp_ai_analyses_org_rls" on rfp_ai_analyses for all
      using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
      with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
  end if;
end $$;


-- ─── 6. updated_at trigger function (shared, idempotent) ───────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_rfps_updated_at') then
    create trigger trg_rfps_updated_at before update on rfps
      for each row execute function set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_rfp_milestones_updated_at') then
    create trigger trg_rfp_milestones_updated_at before update on rfp_milestones
      for each row execute function set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_rfp_competitors_updated_at') then
    create trigger trg_rfp_competitors_updated_at before update on rfp_competitors
      for each row execute function set_updated_at();
  end if;
end $$;
