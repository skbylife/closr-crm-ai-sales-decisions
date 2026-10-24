-- ═══════════════════════════════════════════════════════════════════════
-- Migration 001: AI Event Pipeline Tables
-- ═══════════════════════════════════════════════════════════════════════
-- 增量迁移：需要在 Supabase SQL Editor 中手动执行
-- 此迁移添加 ai_insights 和 ai_events 表，用于 AI 事件驱动管道

-- ─── Tables ──────────────────────────────────────────────────────────

-- AI Insights (缓存每个实体的 AI 分析结果)
create table if not exists ai_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  entity_type text not null,  -- 'deal' | 'contact' | 'account'
  entity_id text not null,    -- 对应实体的 id
  insight_type text not null, -- 'health' | 'risk' | 'action' | 'strategy' | 'profile_summary' | 'impact'
  data jsonb not null default '{}',
  version integer not null default 1,
  last_trigger text,          -- 触发这次更新的事件描述
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(org_id, entity_type, entity_id, insight_type)
);

-- AI Events (事件队列)
create table if not exists ai_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,   -- 'decode.completed' | 'intel.created' | 'deal.stage_changed' | 'contact.updated' | 'news.discovered'
  entity_type text not null,  -- 'email_decode' | 'intel_item' | 'opportunity' | 'contact' | 'account'
  entity_id text not null,
  payload jsonb not null default '{}',  -- 事件附带数据
  status text not null default 'pending',  -- 'pending' | 'processing' | 'completed' | 'failed'
  error text,
  processed_at timestamptz,
  created_at timestamptz default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────

create index if not exists idx_ai_insights_org_id on ai_insights(org_id);
create index if not exists idx_ai_insights_entity on ai_insights(entity_type, entity_id);
create index if not exists idx_ai_insights_type on ai_insights(org_id, insight_type);
create index if not exists idx_ai_events_org_id on ai_events(org_id);
create index if not exists idx_ai_events_status on ai_events(status) where status = 'pending';
create index if not exists idx_ai_events_entity on ai_events(entity_type, entity_id);
create index if not exists idx_ai_events_created on ai_events(created_at desc);

-- ─── Row Level Security ──────────────────────────────────────────────

alter table ai_insights enable row level security;
alter table ai_events enable row level security;

create policy "ai_insights_rls" on ai_insights for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

create policy "ai_events_rls" on ai_events for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
