-- Comments table for collaborative notes on accounts, opportunities, contacts
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('account', 'opportunity', 'contact')),
  entity_id text not null,
  content text not null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Indexes
create index if not exists idx_comments_entity on public.comments (org_id, entity_type, entity_id, created_at);
create index if not exists idx_comments_user on public.comments (user_id);

-- RLS
alter table public.comments enable row level security;

-- Org members can read comments in their org
create policy "comments_select_org" on public.comments
  for select using (
    org_id in (select org_id from public.org_memberships where user_id = auth.uid())
  );

-- Org members can insert comments in their org
create policy "comments_insert_org" on public.comments
  for insert with check (
    org_id in (select org_id from public.org_memberships where user_id = auth.uid())
    and user_id = auth.uid()
  );

-- Users can update their own comments
create policy "comments_update_own" on public.comments
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can delete their own comments
create policy "comments_delete_own" on public.comments
  for delete using (user_id = auth.uid());
