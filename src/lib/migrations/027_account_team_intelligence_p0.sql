-- Migration 027: Account Team Intelligence P0
-- Adds business team ownership and pursuit team coordination without changing account visibility semantics.

alter table accounts add column if not exists business_team_id uuid references teams(id) on delete set null;

-- Composite tenant-safe reference targets for new same-org foreign keys.
create unique index if not exists accounts_id_org_id_uidx on accounts(id, org_id);
create unique index if not exists contacts_id_org_id_uidx on contacts(id, org_id);
create unique index if not exists opportunities_id_org_id_uidx on opportunities(id, org_id);
create unique index if not exists teams_id_org_id_uidx on teams(id, org_id);
create unique index if not exists strategic_plays_id_org_id_uidx on strategic_plays(id, org_id);

create table if not exists pursuit_teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  parent_team_id uuid references teams(id) on delete set null,
  account_id text not null,
  opportunity_id text,
  strategic_play_id uuid references strategic_plays(id) on delete set null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'closed', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint pursuit_teams_account_org_fk foreign key (account_id, org_id) references accounts(id, org_id) on delete cascade
);

create unique index if not exists pursuit_teams_id_org_id_uidx on pursuit_teams(id, org_id);

create table if not exists responsibility_catalog (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  key text not null,
  label text not null,
  description text,
  category text,
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  constraint responsibility_catalog_system_org_check check ((is_system = true and org_id is null) or (is_system = false and org_id is not null))
);

create table if not exists pursuit_team_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  pursuit_team_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_lead boolean not null default false,
  coverage_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint pursuit_team_members_team_org_fk foreign key (pursuit_team_id, org_id) references pursuit_teams(id, org_id) on delete cascade,
  unique (pursuit_team_id, user_id)
);

create unique index if not exists pursuit_team_members_id_org_id_uidx on pursuit_team_members(id, org_id);

create table if not exists pursuit_team_member_responsibilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  pursuit_team_member_id uuid not null,
  responsibility_id uuid not null references responsibility_catalog(id) on delete cascade,
  created_at timestamptz default now(),
  constraint pursuit_team_member_responsibilities_member_org_fk foreign key (pursuit_team_member_id, org_id) references pursuit_team_members(id, org_id) on delete cascade,
  unique (pursuit_team_member_id, responsibility_id)
);

create table if not exists contact_coverage_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  pursuit_team_id uuid not null,
  account_id text not null,
  contact_id text not null,
  primary_user_id uuid references auth.users(id) on delete set null,
  backup_user_id uuid references auth.users(id) on delete set null,
  relationship_goal text,
  relationship_status text not null default 'unknown' check (relationship_status in ('unknown', 'cold', 'warming', 'trusted', 'champion', 'blocker', 'risk')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint contact_coverage_assignments_team_org_fk foreign key (pursuit_team_id, org_id) references pursuit_teams(id, org_id) on delete cascade,
  constraint contact_coverage_assignments_account_org_fk foreign key (account_id, org_id) references accounts(id, org_id) on delete cascade,
  constraint contact_coverage_assignments_contact_org_fk foreign key (contact_id, org_id) references contacts(id, org_id) on delete cascade,
  unique (pursuit_team_id, contact_id)
);

create unique index if not exists contact_coverage_assignments_id_org_id_uidx on contact_coverage_assignments(id, org_id);

create table if not exists contact_coverage_responsibilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_coverage_assignment_id uuid not null,
  responsibility_id uuid not null references responsibility_catalog(id) on delete cascade,
  created_at timestamptz default now(),
  constraint contact_coverage_responsibilities_assignment_org_fk foreign key (contact_coverage_assignment_id, org_id) references contact_coverage_assignments(id, org_id) on delete cascade,
  unique (contact_coverage_assignment_id, responsibility_id)
);

create unique index if not exists responsibility_catalog_system_key_uidx on responsibility_catalog(key) where is_system = true;
create unique index if not exists responsibility_catalog_org_key_uidx on responsibility_catalog(org_id, key) where is_system = false;
create unique index if not exists pursuit_teams_one_active_account_uidx on pursuit_teams(org_id, account_id) where status = 'active' and opportunity_id is null and strategic_play_id is null;

create index if not exists idx_accounts_business_team_id on accounts(business_team_id);
create index if not exists idx_pursuit_teams_org_account on pursuit_teams(org_id, account_id);
create index if not exists idx_pursuit_teams_parent_team_id on pursuit_teams(parent_team_id);
create index if not exists idx_pursuit_team_members_team on pursuit_team_members(pursuit_team_id);
create index if not exists idx_pursuit_team_member_responsibilities_member on pursuit_team_member_responsibilities(pursuit_team_member_id);
create index if not exists idx_contact_coverage_assignments_team on contact_coverage_assignments(pursuit_team_id);
create index if not exists idx_contact_coverage_assignments_contact on contact_coverage_assignments(contact_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_pursuit_teams_updated_at') then
    create trigger trg_pursuit_teams_updated_at before update on pursuit_teams
      for each row execute function set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_pursuit_team_members_updated_at') then
    create trigger trg_pursuit_team_members_updated_at before update on pursuit_team_members
      for each row execute function set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_contact_coverage_assignments_updated_at') then
    create trigger trg_contact_coverage_assignments_updated_at before update on contact_coverage_assignments
      for each row execute function set_updated_at();
  end if;
end $$;

alter table pursuit_teams enable row level security;
alter table responsibility_catalog enable row level security;
alter table pursuit_team_members enable row level security;
alter table pursuit_team_member_responsibilities enable row level security;
alter table contact_coverage_assignments enable row level security;
alter table contact_coverage_responsibilities enable row level security;

drop policy if exists "pursuit_teams_org_members" on pursuit_teams;
create policy "pursuit_teams_org_members" on pursuit_teams for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

drop policy if exists "responsibility_catalog_org_members" on responsibility_catalog;
create policy "responsibility_catalog_org_members" on responsibility_catalog for select
  using (is_system = true or org_id in (select org_id from org_memberships where user_id = auth.uid()));

drop policy if exists "responsibility_catalog_org_write" on responsibility_catalog;
create policy "responsibility_catalog_org_write" on responsibility_catalog for all
  using (is_system = false and org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (is_system = false and org_id in (select org_id from org_memberships where user_id = auth.uid()));

drop policy if exists "pursuit_team_members_org_members" on pursuit_team_members;
create policy "pursuit_team_members_org_members" on pursuit_team_members for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

drop policy if exists "pursuit_team_member_responsibilities_org_members" on pursuit_team_member_responsibilities;
create policy "pursuit_team_member_responsibilities_org_members" on pursuit_team_member_responsibilities for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

drop policy if exists "contact_coverage_assignments_org_members" on contact_coverage_assignments;
create policy "contact_coverage_assignments_org_members" on contact_coverage_assignments for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

drop policy if exists "contact_coverage_responsibilities_org_members" on contact_coverage_responsibilities;
create policy "contact_coverage_responsibilities_org_members" on contact_coverage_responsibilities for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

insert into responsibility_catalog (key, label, description, category, is_system)
values
  ('account_lead', '总负责 / Account Lead', '对账户最终推进结果负责', 'leadership', true),
  ('executive_sponsor', '高层推进', '负责高层支持与关键背书', 'leadership', true),
  ('technical_trust', '技术信任建立', '负责技术可信度、方案信任与评估沟通', 'trust', true),
  ('commercial_owner', '商务合同', '负责商务条款、价格与合同推进', 'commercial', true),
  ('champion_handler', 'Champion 维护', '负责维护内部推动者关系', 'relationship', true),
  ('blocker_handler', 'Blocker 处理', '负责识别和化解阻力点', 'relationship', true),
  ('procurement_process', '采购流程推进', '负责采购路径、节点和材料推进', 'process', true),
  ('legal_security', '法务安全协调', '负责法务、安全与合规协调', 'process', true),
  ('competitive_intel', '竞品情报', '负责竞品信息收集与应对判断', 'intelligence', true),
  ('meeting_lead', '会议主讲', '负责关键会议主讲与节奏控制', 'execution', true),
  ('follow_up', '会后跟进', '负责会后行动项闭环', 'execution', true),
  ('relationship_breakthrough', '关系破冰', '负责关键关系破冰与升温', 'relationship', true),
  ('internal_coordination', '内部资源协调', '负责调动内部资源与跨部门协同', 'execution', true),
  ('risk_fallback', '风险兜底', '负责风险预案与兜底动作', 'risk', true)
on conflict (key) where is_system = true do update set
  label = excluded.label,
  description = excluded.description,
  category = excluded.category;
