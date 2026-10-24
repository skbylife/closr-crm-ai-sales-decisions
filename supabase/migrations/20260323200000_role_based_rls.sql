-- 角色权限细分 RLS 策略
-- Owner/Admin: 看/改组织全部数据
-- Manager: 看/改自己 + 同 team 成员的数据
-- Member: 只看/改自己创建的或分配给自己的数据
--
-- 辅助函数：获取当前用户在组织内的角色

create or replace function get_my_org_role(p_org_id uuid)
returns text
language sql
stable
security definer
as $$
  select role from org_memberships
  where user_id = auth.uid() and org_id = p_org_id
  limit 1;
$$;

-- 辅助函数：获取同 team 的所有 user_id（含自己）
create or replace function get_team_user_ids(p_org_id uuid)
returns setof uuid
language sql
stable
security definer
as $$
  select om2.user_id
  from org_memberships om1
  join org_memberships om2
    on om2.org_id = om1.org_id
    and om2.team_id = om1.team_id
    and om1.team_id is not null
  where om1.user_id = auth.uid()
    and om1.org_id = p_org_id
  union
  select auth.uid();
$$;

-- -----------------------------------------------------------------------
-- 通用业务表 SELECT 策略（替换原有 for all 策略）
-- 保留 org_id is null 的向后兼容
-- -----------------------------------------------------------------------

-- === accounts ===
drop policy if exists "accounts_rls" on accounts;

create policy "accounts_select" on accounts for select using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "accounts_insert" on accounts for insert with check (
  user_id = auth.uid()
  and (
    org_id is null
    or org_id in (select org_id from org_memberships where user_id = auth.uid())
  )
);

create policy "accounts_update" on accounts for update using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "accounts_delete" on accounts for delete using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
    )
  )
);

-- === contacts ===
drop policy if exists "contacts_rls" on contacts;

create policy "contacts_select" on contacts for select using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "contacts_insert" on contacts for insert with check (
  user_id = auth.uid()
  and (org_id is null or org_id in (select org_id from org_memberships where user_id = auth.uid()))
);

create policy "contacts_update" on contacts for update using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "contacts_delete" on contacts for delete using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

-- === opportunities（额外支持 assigned_to） ===
drop policy if exists "opportunities_rls" on opportunities;

create policy "opportunities_select" on opportunities for select using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or assigned_to = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "opportunities_insert" on opportunities for insert with check (
  user_id = auth.uid()
  and (org_id is null or org_id in (select org_id from org_memberships where user_id = auth.uid()))
);

create policy "opportunities_update" on opportunities for update using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or assigned_to = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "opportunities_delete" on opportunities for delete using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

-- === intel_items ===
drop policy if exists "intel_items_rls" on intel_items;

create policy "intel_items_select" on intel_items for select using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "intel_items_insert" on intel_items for insert with check (
  user_id = auth.uid()
  and (org_id is null or org_id in (select org_id from org_memberships where user_id = auth.uid()))
);

create policy "intel_items_update" on intel_items for update using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

create policy "intel_items_delete" on intel_items for delete using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

-- === email_decodes ===
drop policy if exists "email_decodes_rls" on email_decodes;

create policy "email_decodes_select" on email_decodes for select using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "email_decodes_insert" on email_decodes for insert with check (
  user_id = auth.uid()
  and (org_id is null or org_id in (select org_id from org_memberships where user_id = auth.uid()))
);

create policy "email_decodes_update" on email_decodes for update using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

create policy "email_decodes_delete" on email_decodes for delete using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

-- === composed_emails ===
drop policy if exists "composed_emails_rls" on composed_emails;

create policy "composed_emails_select" on composed_emails for select using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "composed_emails_insert" on composed_emails for insert with check (
  user_id = auth.uid()
  and (org_id is null or org_id in (select org_id from org_memberships where user_id = auth.uid()))
);

create policy "composed_emails_update" on composed_emails for update using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

create policy "composed_emails_delete" on composed_emails for delete using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

-- === meeting_preps ===
drop policy if exists "meeting_preps_rls" on meeting_preps;

create policy "meeting_preps_select" on meeting_preps for select using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "meeting_preps_insert" on meeting_preps for insert with check (
  user_id = auth.uid()
  and (org_id is null or org_id in (select org_id from org_memberships where user_id = auth.uid()))
);

create policy "meeting_preps_update" on meeting_preps for update using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

create policy "meeting_preps_delete" on meeting_preps for delete using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

-- === discovery_notes ===
drop policy if exists "discovery_notes_rls" on discovery_notes;

create policy "discovery_notes_select" on discovery_notes for select using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "discovery_notes_insert" on discovery_notes for insert with check (
  user_id = auth.uid()
  and (org_id is null or org_id in (select org_id from org_memberships where user_id = auth.uid()))
);

create policy "discovery_notes_update" on discovery_notes for update using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

create policy "discovery_notes_delete" on discovery_notes for delete using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

-- === knowledge_items ===
drop policy if exists "knowledge_items_rls" on knowledge_items;

create policy "knowledge_items_select" on knowledge_items for select using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "knowledge_items_insert" on knowledge_items for insert with check (
  user_id = auth.uid()
  and (org_id is null or org_id in (select org_id from org_memberships where user_id = auth.uid()))
);

create policy "knowledge_items_update" on knowledge_items for update using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

create policy "knowledge_items_delete" on knowledge_items for delete using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);

-- === tasks（额外支持 assigned_to） ===
drop policy if exists "tasks_rls" on tasks;

create policy "tasks_select" on tasks for select using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or assigned_to = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "tasks_insert" on tasks for insert with check (
  user_id = auth.uid()
  and (org_id is null or org_id in (select org_id from org_memberships where user_id = auth.uid()))
);

create policy "tasks_update" on tasks for update using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (
      get_my_org_role(org_id) in ('owner', 'admin')
      or user_id = auth.uid()
      or assigned_to = auth.uid()
      or user_id in (select get_team_user_ids(org_id))
    )
  )
);

create policy "tasks_delete" on tasks for delete using (
  (org_id is null and user_id = auth.uid())
  or (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    and (get_my_org_role(org_id) in ('owner', 'admin') or user_id = auth.uid())
  )
);
