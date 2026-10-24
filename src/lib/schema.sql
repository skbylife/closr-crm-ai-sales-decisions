-- Closr Database Schema (text IDs - compatible with app's uid() generator)
-- Multi-tenant with RLS: organization-level data isolation.

-- ═══════════════════════════════════════════════════════════════════════
-- Organization & Membership Tables
-- ═══════════════════════════════════════════════════════════════════════

-- 0a. Organizations
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  logo_url text,
  settings jsonb default '{}',  -- { manager_can_view_member_decodes: boolean }
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 0b. Teams
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

-- 0c. Organization Memberships
create table if not exists org_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  org_id uuid references organizations(id) on delete cascade not null,
  team_id uuid references teams(id) on delete set null,
  role text not null check (role in ('owner', 'admin', 'manager', 'member')),
  job_title text default 'ae',
  display_name text,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz default now(),
  unique(user_id, org_id)
);

-- 0d. Invitations
create table if not exists org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'member')),
  token text unique not null,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Business Data Tables (with org_id for organization-level isolation)
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Accounts
create table if not exists accounts (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  industry text,
  website text,
  deal_value numeric,
  deal_stage text,
  deal_health text,
  notes text,
  market_intel jsonb,
  strategy jsonb,
  meddicc jsonb,
  opportunity_ids text[] default '{}',
  last_activity timestamptz,
  created_at timestamptz default now()
);

-- 2. Contacts
create table if not exists contacts (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  account_id text references accounts(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  mobile_phone text,
  title text,
  role text,
  reports_to text,
  department text,
  linkedin text,
  wechat text,
  twitter text,
  location text,
  timezone text,
  preferred_channel text,
  preferred_language text,
  personal_notes text,
  decision_style text,
  risk_appetite text,
  communication_notes text,
  landmines text,
  profile jsonb,
  contact_profile jsonb,
  relationship_strength integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz,
  last_contacted_at timestamptz
);

-- 3. Opportunities
create table if not exists opportunities (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  account_id text references accounts(id) on delete cascade,
  name text not null,
  value numeric,
  currency text default 'USD',
  stage text,
  probability integer,
  expected_close_date date,
  owner text,
  source text,
  lost_reason text,
  won_date date,
  meddicc jsonb,
  mutual_action_plan jsonb,
  competitor_ids text[] default '{}',
  notes text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. Intel Items
create table if not exists intel_items (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  account_id text references accounts(id) on delete cascade,
  account_name text,
  type text,
  source text,
  title text,
  content text,
  summary text,
  credibility text,
  urgency text,
  relevance text,
  date text,
  analysis jsonb,
  related_contact_ids text[] default '{}',
  opportunity_id text references opportunities(id) on delete set null,
  spin_classification jsonb,
  created_at timestamptz default now()
);

-- 5. Email Decodes
create table if not exists email_decodes (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  account_id text references accounts(id) on delete set null,
  account_name text,
  opportunity_id text,
  email_text text,
  client_name text,
  deal_stage text,
  signal_source text,
  analysis_goal text,
  signal_context text,
  signal_status text default 'new',
  signal_task_id text,
  signal_status_updated_at timestamptz,
  decode jsonb,
  strategy jsonb,
  date text,
  original_sender_email text,
  original_sender_name text,
  matched_contact_id text,
  matched_account_id text,
  matched_account_name text,
  created_at timestamptz default now()
);

-- 6. Composed Emails
create table if not exists composed_emails (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  account_id text references accounts(id) on delete set null,
  contact_id text,
  contact_name text,
  opportunity_id text,
  email_type text,
  goal text,
  subject text,
  body text,
  sending_advice text,
  status text default 'draft',
  final_content text,
  suggested_cc jsonb,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- 7. Meeting Preps
create table if not exists meeting_preps (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  account_id text references accounts(id) on delete cascade,
  input jsonb,
  result jsonb,
  created_at timestamptz default now()
);

-- 8. Discovery Notes
create table if not exists discovery_notes (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  opportunity_id text,
  date text,
  source text,
  content text,
  spin_classification jsonb,
  created_at timestamptz default now()
);

-- 9. Knowledge Items
create table if not exists knowledge_items (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  title text not null,
  content text,
  category text,
  file_size integer,
  created_at timestamptz default now()
);

-- 10. User Settings
create table if not exists user_settings (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  user_name text,
  role text,
  role_level text,
  targets jsonb,
  created_at timestamptz default now()
);

-- 11. Tasks
create table if not exists tasks (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  account_id text,
  opportunity_id text,
  contact_id text,
  title text not null,
  description text,
  status text default 'todo',
  priority text default 'medium',
  due_date text,
  assigned_to uuid references auth.users(id) on delete set null,
  source text,
  source_id text,
  ai_generated boolean default false,
  attachments jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 12. Activity Logs (admin/owner only)
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

-- ═══════════════════════════════════════════════════════════════════════
-- AI Event Pipeline Tables
-- ═══════════════════════════════════════════════════════════════════════

-- 13. AI Insights (缓存每个实体的 AI 分析结果)
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

-- 14. AI Events (事件队列)
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

-- ═══════════════════════════════════════════════════════════════════════
-- Strategic Play Engine (做局引擎)
-- ═══════════════════════════════════════════════════════════════════════

-- 15. Strategic Plays (做局计划)
create table if not exists strategic_plays (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  account_id text references accounts(id) on delete cascade not null,
  opportunity_id text,
  target_contact_id text,
  goal_type text not null,     -- 'reach_key_person' | 'remove_blocker' | 'create_urgency' | 'block_competitor' | 'expand_deal' | 'reactivate' | 'build_relationship'
  goal_description text not null,
  situation_judgment text,
  strategic_objective text,
  stakeholder_path jsonb default '[]',
  evidence_basis jsonb default '[]',
  risk_counter_evidence jsonb default '[]',
  knowledge_traces jsonb default '[]',
  knowledge_gaps jsonb default '[]',
  evidence_provenance jsonb,
  steps jsonb not null default '[]',
  alternative_paths jsonb default '[]',
  confidence numeric(5,2) default 0,
  status text not null default 'active',  -- 'active' | 'in_progress' | 'completed' | 'abandoned'
  ai_model text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Channel Management (渠道管理)
-- ═══════════════════════════════════════════════════════════════════════

-- 16. Channel Partners (渠道合作伙伴)
create table if not exists channel_partners (
  id text primary key,
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  type text not null,          -- 'reseller' | 'distributor' | 'var' | 'si' | 'referral'
  tier text default 'registered',  -- 'gold' | 'silver' | 'bronze' | 'registered'
  region text,
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  deal_count integer default 0,
  total_revenue numeric default 0,
  active_deals integer default 0,
  win_rate numeric default 0,
  commission_rate numeric default 10,
  contract_expiry text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 17. Deal Registrations (渠道报备)
create table if not exists deal_registrations (
  id text primary key,
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  partner_id text references channel_partners(id) on delete cascade,
  partner_name text,
  account_name text not null,
  deal_value numeric default 0,
  status text default 'pending',  -- 'pending' | 'approved' | 'expired' | 'rejected'
  submitted_at timestamptz default now(),
  expires_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════════════

-- Indexes (foreign keys)
create index if not exists idx_contacts_account_id on contacts(account_id);
create index if not exists idx_opportunities_account_id on opportunities(account_id);
create index if not exists idx_intel_items_account_id on intel_items(account_id);
create index if not exists idx_email_decodes_account_id on email_decodes(account_id);
create index if not exists idx_email_decodes_signal_status on email_decodes(org_id, signal_status, created_at desc);
create index if not exists idx_composed_emails_account_id on composed_emails(account_id);
create index if not exists idx_meeting_preps_account_id on meeting_preps(account_id);
create index if not exists idx_discovery_notes_opportunity_id on discovery_notes(opportunity_id);

-- Indexes (org_id for tenant isolation)
create index if not exists idx_accounts_org_id on accounts(org_id);
create index if not exists idx_contacts_org_id on contacts(org_id);
create index if not exists idx_opportunities_org_id on opportunities(org_id);
create index if not exists idx_intel_items_org_id on intel_items(org_id);
create index if not exists idx_email_decodes_org_id on email_decodes(org_id);
create index if not exists idx_composed_emails_org_id on composed_emails(org_id);
create index if not exists idx_meeting_preps_org_id on meeting_preps(org_id);
create index if not exists idx_discovery_notes_org_id on discovery_notes(org_id);
create index if not exists idx_knowledge_items_org_id on knowledge_items(org_id);
create index if not exists idx_user_settings_org_id on user_settings(org_id);
create index if not exists idx_tasks_org_id on tasks(org_id);

-- Indexes (user_id — kept for backward compat and user-level queries)
create index if not exists idx_accounts_user_id on accounts(user_id);
create index if not exists idx_contacts_user_id on contacts(user_id);
create index if not exists idx_opportunities_user_id on opportunities(user_id);
create index if not exists idx_intel_items_user_id on intel_items(user_id);
create index if not exists idx_email_decodes_user_id on email_decodes(user_id);
create index if not exists idx_composed_emails_user_id on composed_emails(user_id);
create index if not exists idx_meeting_preps_user_id on meeting_preps(user_id);
create index if not exists idx_discovery_notes_user_id on discovery_notes(user_id);
create index if not exists idx_knowledge_items_user_id on knowledge_items(user_id);
create index if not exists idx_user_settings_user_id on user_settings(user_id);
create index if not exists idx_tasks_user_id on tasks(user_id);

-- Indexes (org tables)
create index if not exists idx_teams_org_id on teams(org_id);
create index if not exists idx_org_memberships_user_id on org_memberships(user_id);
create index if not exists idx_org_memberships_org_id on org_memberships(org_id);
create index if not exists idx_org_invitations_org_id on org_invitations(org_id);
create index if not exists idx_org_invitations_token on org_invitations(token);
create index if not exists idx_org_invitations_email on org_invitations(email);

-- Indexes (activity_logs)
create index if not exists idx_activity_logs_org_id on activity_logs(org_id);
create index if not exists idx_activity_logs_user_id on activity_logs(user_id);
create index if not exists idx_activity_logs_created_at on activity_logs(created_at desc);
create index if not exists idx_activity_logs_account_id on activity_logs(account_id);

-- Indexes (AI Event Pipeline)
create index if not exists idx_ai_insights_org_id on ai_insights(org_id);
create index if not exists idx_ai_insights_entity on ai_insights(entity_type, entity_id);
create index if not exists idx_ai_insights_type on ai_insights(org_id, insight_type);
create index if not exists idx_ai_events_org_id on ai_events(org_id);
create index if not exists idx_ai_events_status on ai_events(status) where status = 'pending';
create index if not exists idx_ai_events_entity on ai_events(entity_type, entity_id);
create index if not exists idx_ai_events_created on ai_events(created_at desc);

-- Indexes (Strategic Plays)
create index if not exists idx_strategic_plays_org_id on strategic_plays(org_id);
create index if not exists idx_strategic_plays_account_id on strategic_plays(account_id);
create index if not exists idx_strategic_plays_status on strategic_plays(status) where status in ('active', 'in_progress');

-- Indexes (Channel Management)
create index if not exists idx_channel_partners_org_id on channel_partners(org_id);
create index if not exists idx_deal_registrations_org_id on deal_registrations(org_id);
create index if not exists idx_deal_registrations_partner_id on deal_registrations(partner_id);

-- ═══════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
alter table organizations enable row level security;
alter table teams enable row level security;
alter table org_memberships enable row level security;
alter table org_invitations enable row level security;
alter table accounts enable row level security;
alter table contacts enable row level security;
alter table opportunities enable row level security;
alter table intel_items enable row level security;
alter table email_decodes enable row level security;
alter table composed_emails enable row level security;
alter table meeting_preps enable row level security;
alter table discovery_notes enable row level security;
alter table knowledge_items enable row level security;
alter table user_settings enable row level security;
alter table tasks enable row level security;
alter table activity_logs enable row level security;
alter table ai_insights enable row level security;
alter table ai_events enable row level security;
alter table strategic_plays enable row level security;
alter table channel_partners enable row level security;
alter table deal_registrations enable row level security;

-- Organization tables: users can see orgs they belong to
create policy "organizations_rls" on organizations for all
  using (id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (id in (select org_id from org_memberships where user_id = auth.uid()));

create policy "teams_rls" on teams for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

create policy "org_memberships_rls" on org_memberships for all
  using (org_id in (select om.org_id from org_memberships om where om.user_id = auth.uid()))
  with check (org_id in (select om.org_id from org_memberships om where om.user_id = auth.uid()));

create policy "org_invitations_rls" on org_invitations for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

-- Business data: org_id based isolation (fallback to user_id for unmigrated data)
create policy "accounts_rls" on accounts for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

create policy "contacts_rls" on contacts for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

create policy "opportunities_rls" on opportunities for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

create policy "intel_items_rls" on intel_items for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

create policy "email_decodes_rls" on email_decodes for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

create policy "composed_emails_rls" on composed_emails for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

create policy "meeting_preps_rls" on meeting_preps for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

create policy "discovery_notes_rls" on discovery_notes for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

create policy "knowledge_items_rls" on knowledge_items for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

create policy "user_settings_rls" on user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "tasks_rls" on tasks for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

create policy "ai_insights_rls" on ai_insights for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

create policy "ai_events_rls" on ai_events for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

create policy "strategic_plays_rls" on strategic_plays for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

create policy "channel_partners_rls" on channel_partners for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

create policy "deal_registrations_rls" on deal_registrations for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

-- Activity logs: only owner/admin can read; service role inserts bypass RLS
create policy "admin_only_activity_logs" on activity_logs for select
  using (
    org_id in (
      select org_id from org_memberships
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- Migration SQL (run manually on existing databases)
-- ═══════════════════════════════════════════════════════════════════════
-- ALTER TABLE accounts ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- ALTER TABLE contacts ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;
-- ALTER TABLE intel_items ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- ALTER TABLE email_decodes ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- ALTER TABLE composed_emails ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- ALTER TABLE meeting_preps ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- ALTER TABLE discovery_notes ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- ALTER TABLE tasks ALTER COLUMN assigned_to TYPE uuid USING assigned_to::uuid;
