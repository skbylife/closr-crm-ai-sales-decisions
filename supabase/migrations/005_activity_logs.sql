-- 005_activity_logs.sql
-- Activity logs table, indexes, and RLS policy.
-- Idempotent: safe to re-run.

-- Activity Logs (admin/owner only)
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  org_id uuid references organizations(id) on delete cascade,
  user_display_name text,
  action_type text not null,
  entity_type text,
  entity_id text,
  entity_name text,
  account_id text,
  account_name text,
  contact_id text,
  contact_name text,
  opportunity_id text,
  summary text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_activity_logs_org_id on activity_logs(org_id);
create index if not exists idx_activity_logs_user_id on activity_logs(user_id);
create index if not exists idx_activity_logs_created_at on activity_logs(created_at desc);
create index if not exists idx_activity_logs_account_id on activity_logs(account_id);

-- RLS
alter table activity_logs enable row level security;

drop policy if exists "admin_only_activity_logs" on activity_logs;
create policy "admin_only_activity_logs" on activity_logs for select
  using (
    org_id in (
      select org_id from org_memberships
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
