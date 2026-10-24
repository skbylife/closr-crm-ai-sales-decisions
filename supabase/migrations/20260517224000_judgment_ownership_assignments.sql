-- Judgment ownership assignments
-- Human-confirmed ownership for account/opportunity/strategic-play judgments.

create table if not exists judgment_ownership_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  account_id uuid not null,
  opportunity_id uuid null,
  strategic_play_id uuid null,
  judgment_type text not null check (judgment_type in (
    'account_strategy',
    'opportunity_forecast',
    'strategic_play',
    'relationship_coverage',
    'evidence_verification',
    'calibration_review'
  )),
  assigned_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid null references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'completed', 'revoked')),
  source text not null default 'manual' check (source in ('manual', 'management_queue', 'strategic_play', 'decode_signal', 'rfp_signal')),
  reason text null,
  due_at timestamptz null,
  completed_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint judgment_ownership_assignments_account_org_fk
    foreign key (account_id, org_id) references accounts(id, org_id) on delete cascade,
  constraint judgment_ownership_assignments_opportunity_org_fk
    foreign key (opportunity_id, org_id) references opportunities(id, org_id) on delete cascade,
  constraint judgment_ownership_assignments_play_org_fk
    foreign key (strategic_play_id, org_id) references strategic_plays(id, org_id) on delete cascade
);

create unique index if not exists judgment_ownership_account_active_uidx
  on judgment_ownership_assignments(org_id, account_id, judgment_type)
  where status = 'active' and opportunity_id is null and strategic_play_id is null;

create unique index if not exists judgment_ownership_opportunity_active_uidx
  on judgment_ownership_assignments(org_id, opportunity_id, judgment_type)
  where status = 'active' and opportunity_id is not null and strategic_play_id is null;

create unique index if not exists judgment_ownership_play_active_uidx
  on judgment_ownership_assignments(org_id, strategic_play_id, judgment_type)
  where status = 'active' and strategic_play_id is not null;

create index if not exists idx_judgment_ownership_org_account
  on judgment_ownership_assignments(org_id, account_id, status, updated_at desc);

create index if not exists idx_judgment_ownership_assignee
  on judgment_ownership_assignments(org_id, assigned_user_id, status, due_at);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_judgment_ownership_assignments_updated_at') then
    create trigger trg_judgment_ownership_assignments_updated_at before update on judgment_ownership_assignments
    for each row execute function update_updated_at_column();
  end if;
end $$;

alter table judgment_ownership_assignments enable row level security;

drop policy if exists "judgment_ownership_org_members" on judgment_ownership_assignments;
create policy "judgment_ownership_org_members" on judgment_ownership_assignments for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
