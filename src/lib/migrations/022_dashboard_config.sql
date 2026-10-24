-- ═══════════════════════════════════════════════════════════════════════
-- Migration 022: Dashboard Config (角色视图配置)
-- ═══════════════════════════════════════════════════════════════════════
-- Additive only. All IF NOT EXISTS / idempotent.
-- Stores per-org, per-role dashboard module layout overrides.

-- ─── 1. org_dashboard_configs ─────────────────────────────────────────

create table if not exists org_dashboard_configs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  role_level  text not null check (role_level in ('ae', 'ae-lead', 'director', 'executive', 'owner')),
  module_configs jsonb not null default '[]',
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz default now(),
  unique (org_id, role_level)
);

comment on table org_dashboard_configs is 'Per-org override of dashboard module layout per role level';
comment on column org_dashboard_configs.module_configs is 'JSON array of ModuleConfig objects matching dashboard-layout.ts schema';

create index if not exists idx_dashboard_configs_org
  on org_dashboard_configs(org_id);

-- ─── 2. RLS ───────────────────────────────────────────────────────────

alter table org_dashboard_configs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'dashboard_configs_org_rls') then
    create policy "dashboard_configs_org_rls" on org_dashboard_configs for all
      using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
      with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
  end if;
end $$;
