-- =====================================================================
-- Closr CRM — Complete Supabase Migration
-- Generated from codebase analysis (src/lib/db.ts, db-server.ts,
-- babel-engine/types.ts, API routes)
--
-- Multi-tenant architecture:
--   - Organization-level isolation via org_id
--   - Fallback to user_id for users not yet in an org
--   - RLS policies enforce both paths
--
-- Run this on a fresh Supabase project. For existing databases,
-- see the incremental ALTER statements at the bottom.
-- =====================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 0. Utility: auto-update updated_at timestamp
-- ═══════════════════════════════════════════════════════════════════════

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Organization & Membership Tables
-- ═══════════════════════════════════════════════════════════════════════

-- 1a. Organizations
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  logo_url    text,
  settings    jsonb default '{}'::jsonb,  -- { manager_can_view_member_decodes: boolean }
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create trigger trg_organizations_updated_at
  before update on organizations
  for each row execute function update_updated_at();

-- 1b. Teams (sub-groups within an org)
create table if not exists teams (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references organizations(id) on delete cascade not null,
  name        text not null,
  created_at  timestamptz default now()
);

-- 1c. Organization Memberships
create table if not exists org_memberships (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  org_id        uuid references organizations(id) on delete cascade not null,
  team_id       uuid references teams(id) on delete set null,
  role          text not null check (role in ('owner', 'admin', 'manager', 'member')),
  job_title     text default 'ae',  -- ae | manager | executive | admin
  display_name  text,
  invited_by    uuid references auth.users(id) on delete set null,
  joined_at     timestamptz default now(),
  unique(user_id, org_id)
);

-- 1d. Invitations
create table if not exists org_invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references organizations(id) on delete cascade not null,
  email       text not null,
  role        text not null check (role in ('admin', 'manager', 'member')),
  token       text unique not null,
  invited_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  created_at  timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Business Data Tables
-- ═══════════════════════════════════════════════════════════════════════

-- 2a. Accounts
create table if not exists accounts (
  id              text primary key,
  user_id         uuid references auth.users(id) on delete cascade,
  org_id          uuid references organizations(id) on delete cascade,
  name            text not null,
  industry        text,
  website         text,
  deal_value      numeric,
  deal_stage      text,                -- e.g. 'discovery', 'negotiation'
  deal_health     text,                -- 'healthy' | 'at_risk' | 'critical'
  notes           text,
  market_intel    jsonb,               -- MarketIntelCache (news, financial, meeting prep)
  strategy        jsonb,               -- EnhancedAccountStrategy
  meddicc         jsonb,               -- MeddiccData (account-level qualification)
  opportunity_ids text[] default '{}',
  last_activity   timestamptz,
  created_at      timestamptz default now()
);

-- 2b. Contacts
create table if not exists contacts (
  id                  text primary key,
  user_id             uuid references auth.users(id) on delete cascade,
  org_id              uuid references organizations(id) on delete cascade,
  account_id          text references accounts(id) on delete cascade,
  name                text not null,
  email               text,
  phone               text,
  mobile_phone        text,
  title               text,            -- job title
  role                text,            -- ContactRole: decision_maker | champion | etc.
  reports_to          text,            -- contact id of manager within same account
  department          text,
  -- Social & professional links
  linkedin            text,
  wechat              text,
  twitter             text,
  -- Location
  location            text,            -- city/office
  timezone            text,
  -- Communication preferences
  preferred_channel   text,            -- email | phone | wechat | teams | in_person
  preferred_language  text,
  -- Notes & personality
  personal_notes      text,            -- interests, hobbies, rapport info
  decision_style      text,            -- analytical | driver | amiable | expressive
  risk_appetite       text,            -- aggressive | moderate | cautious
  communication_notes text,
  landmines           text,
  -- AI generated profiles
  profile             jsonb,           -- PsychologicalProfile
  contact_profile     jsonb,           -- ContactProfileResult
  -- Timestamps
  created_at          timestamptz default now(),
  updated_at          timestamptz,
  last_contacted_at   timestamptz
);

-- 2c. Opportunities
create table if not exists opportunities (
  id                  text primary key,
  user_id             uuid references auth.users(id) on delete cascade,
  org_id              uuid references organizations(id) on delete cascade,
  account_id          text references accounts(id) on delete cascade,
  name                text not null,
  value               numeric,
  currency            text default 'USD',
  stage               text,            -- OpportunityStage enum
  probability         integer,         -- 0-100
  expected_close_date date,
  owner               text,            -- free-text owner name
  source              text,            -- lead source
  lost_reason         text,
  won_date            date,
  meddicc             jsonb,           -- MeddiccAssessment (opportunity-level)
  mutual_action_plan  jsonb,           -- MutualActionPlan
  competitor_ids      text[] default '{}',
  notes               text,
  assigned_to         uuid references auth.users(id) on delete set null,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create trigger trg_opportunities_updated_at
  before update on opportunities
  for each row execute function update_updated_at();

-- 2d. Intel Items
create table if not exists intel_items (
  id                   text primary key,
  user_id              uuid references auth.users(id) on delete cascade,
  org_id               uuid references organizations(id) on delete cascade,
  account_id           text references accounts(id) on delete cascade,
  account_name         text,
  type                 text,           -- news | earnings | leadership_change | competitor | manual | discovery
  source               text,           -- IntelSource enum
  title                text,
  content              text,
  summary              text,
  credibility          text,           -- high | medium | low
  urgency              text,           -- high | medium | low
  relevance            text,
  date                 text,
  analysis             jsonb,          -- IntelAnalysis
  related_contact_ids  text[] default '{}',
  opportunity_id       text references opportunities(id) on delete set null,
  spin_classification  jsonb,          -- SpinItem[]
  created_at           timestamptz default now()
);

-- 2e. Email Decodes
create table if not exists email_decodes (
  id                    text primary key,
  user_id               uuid references auth.users(id) on delete cascade,
  org_id                uuid references organizations(id) on delete cascade,
  account_id            text references accounts(id) on delete set null,
  account_name          text,
  opportunity_id        text references opportunities(id) on delete set null,
  email_text            text,
  client_name           text,
  deal_stage            text,
  decode                jsonb,         -- DecodeOutput
  strategy              jsonb,         -- StrategyOutput
  date                  text,
  -- Email forwarding enrichment fields
  original_sender_email text,
  original_sender_name  text,
  matched_contact_id    text,
  matched_account_id    text,
  matched_account_name  text,
  created_at            timestamptz default now()
);

-- 2f. Composed Emails
create table if not exists composed_emails (
  id              text primary key,
  user_id         uuid references auth.users(id) on delete cascade,
  org_id          uuid references organizations(id) on delete cascade,
  account_id      text references accounts(id) on delete set null,
  contact_id      text references contacts(id) on delete set null,
  contact_name    text,
  opportunity_id  text references opportunities(id) on delete set null,
  email_type      text,                -- EmailType enum
  goal            text,
  subject         text,
  body            text,
  sending_advice  text,
  status          text default 'draft', -- draft | sent
  final_content   text,
  suggested_cc    jsonb,               -- string[]
  sent_at         timestamptz,
  created_at      timestamptz default now()
);

-- 2g. Meeting Preps
create table if not exists meeting_preps (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  org_id      uuid references organizations(id) on delete cascade,
  account_id  text references accounts(id) on delete cascade,
  input       jsonb,                   -- MeetingPrepInput
  result      jsonb,                   -- MeetingPrepResult
  created_at  timestamptz default now()
);

-- 2h. Discovery Notes
create table if not exists discovery_notes (
  id                  text primary key,
  user_id             uuid references auth.users(id) on delete cascade,
  org_id              uuid references organizations(id) on delete cascade,
  opportunity_id      text references opportunities(id) on delete set null,
  date                text,
  source              text,            -- meeting | call | email | other
  content             text,
  spin_classification jsonb,           -- SpinItem[]
  created_at          timestamptz default now()
);

-- 2i. Knowledge Items
create table if not exists knowledge_items (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  org_id      uuid references organizations(id) on delete cascade,
  title       text not null,
  content     text,
  category    text,                    -- company_info | competitor | industry | sales_tools | other
  file_size   integer,
  created_at  timestamptz default now()
);

-- 2j. User Settings
create table if not exists user_settings (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  org_id      uuid references organizations(id) on delete cascade,
  user_name   text,
  role        text,
  role_level  text,                    -- ae | manager | executive | admin
  -- gemini_key removed (security risk, unused)
  targets     jsonb,                   -- { quarterly, monthly, coverage, etc. }
  created_at  timestamptz default now()
);

-- 2k. Tasks (Kanban board)
create table if not exists tasks (
  id              text primary key,
  user_id         uuid references auth.users(id) on delete cascade,
  org_id          uuid references organizations(id) on delete cascade,
  account_id      text references accounts(id) on delete set null,
  opportunity_id  text references opportunities(id) on delete set null,
  contact_id      text references contacts(id) on delete set null,
  title           text not null,
  description     text,
  status          text default 'todo',    -- todo | in_progress | done | blocked
  priority        text default 'medium',  -- low | medium | high | urgent
  due_date        text,
  assigned_to     uuid references auth.users(id) on delete set null,
  source          text,                   -- manual | decode | intel | meddicc
  source_id       text,
  ai_generated    boolean default false,
  attachments     jsonb default '[]'::jsonb,  -- TaskAttachment[]
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create trigger trg_tasks_updated_at
  before update on tasks
  for each row execute function update_updated_at();

-- 2l. Activity Logs (admin/owner audit trail)
create table if not exists activity_logs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null,
  org_id             uuid references organizations(id) on delete cascade,
  user_display_name  text,
  action_type        text not null,
  entity_type        text,
  entity_id          text,
  entity_name        text,
  account_id         text,
  account_name       text,
  contact_id         text,
  contact_name       text,
  opportunity_id     text,
  summary            text,
  metadata           jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Indexes
-- ═══════════════════════════════════════════════════════════════════════

-- Foreign key indexes
create index if not exists idx_contacts_account_id           on contacts(account_id);
create index if not exists idx_opportunities_account_id      on opportunities(account_id);
create index if not exists idx_intel_items_account_id        on intel_items(account_id);
create index if not exists idx_email_decodes_account_id      on email_decodes(account_id);
create index if not exists idx_composed_emails_account_id    on composed_emails(account_id);
create index if not exists idx_meeting_preps_account_id      on meeting_preps(account_id);
create index if not exists idx_discovery_notes_opportunity_id on discovery_notes(opportunity_id);

-- org_id indexes (tenant isolation — critical for query performance)
create index if not exists idx_accounts_org_id               on accounts(org_id);
create index if not exists idx_contacts_org_id               on contacts(org_id);
create index if not exists idx_opportunities_org_id          on opportunities(org_id);
create index if not exists idx_intel_items_org_id            on intel_items(org_id);
create index if not exists idx_email_decodes_org_id          on email_decodes(org_id);
create index if not exists idx_composed_emails_org_id        on composed_emails(org_id);
create index if not exists idx_meeting_preps_org_id          on meeting_preps(org_id);
create index if not exists idx_discovery_notes_org_id        on discovery_notes(org_id);
create index if not exists idx_knowledge_items_org_id        on knowledge_items(org_id);
create index if not exists idx_user_settings_org_id          on user_settings(org_id);
create index if not exists idx_tasks_org_id                  on tasks(org_id);

-- user_id indexes (fallback queries for users without an org)
create index if not exists idx_accounts_user_id              on accounts(user_id);
create index if not exists idx_contacts_user_id              on contacts(user_id);
create index if not exists idx_opportunities_user_id         on opportunities(user_id);
create index if not exists idx_intel_items_user_id           on intel_items(user_id);
create index if not exists idx_email_decodes_user_id         on email_decodes(user_id);
create index if not exists idx_composed_emails_user_id       on composed_emails(user_id);
create index if not exists idx_meeting_preps_user_id         on meeting_preps(user_id);
create index if not exists idx_discovery_notes_user_id       on discovery_notes(user_id);
create index if not exists idx_knowledge_items_user_id       on knowledge_items(user_id);
create index if not exists idx_user_settings_user_id         on user_settings(user_id);
create index if not exists idx_tasks_user_id                 on tasks(user_id);

-- Organization table indexes
create index if not exists idx_teams_org_id                  on teams(org_id);
create index if not exists idx_org_memberships_user_id       on org_memberships(user_id);
create index if not exists idx_org_memberships_org_id        on org_memberships(org_id);
create index if not exists idx_org_invitations_org_id        on org_invitations(org_id);
create index if not exists idx_org_invitations_token         on org_invitations(token);
create index if not exists idx_org_invitations_email         on org_invitations(email);

-- Activity log indexes
create index if not exists idx_activity_logs_org_id          on activity_logs(org_id);
create index if not exists idx_activity_logs_user_id         on activity_logs(user_id);
create index if not exists idx_activity_logs_created_at      on activity_logs(created_at desc);
create index if not exists idx_activity_logs_account_id      on activity_logs(account_id);

-- Contacts email lookup (used by email-webhook for sender matching)
create index if not exists idx_contacts_email_lower          on contacts(lower(email));

-- Pipeline & timeline query indexes
create index if not exists idx_opportunities_stage            on opportunities(org_id, stage);
create index if not exists idx_activity_logs_entity           on activity_logs(entity_type, entity_id, created_at desc);
create index if not exists idx_tasks_status                   on tasks(org_id, status);
create index if not exists idx_tasks_due_date                 on tasks(org_id, due_date);
create index if not exists idx_intel_items_opportunity_id     on intel_items(opportunity_id);
create index if not exists idx_composed_emails_opportunity_id on composed_emails(opportunity_id);
create index if not exists idx_email_decodes_opportunity_id   on email_decodes(opportunity_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Row Level Security
-- ═══════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
alter table organizations   enable row level security;
alter table teams            enable row level security;
alter table org_memberships  enable row level security;
alter table org_invitations  enable row level security;
alter table accounts         enable row level security;
alter table contacts         enable row level security;
alter table opportunities    enable row level security;
alter table intel_items      enable row level security;
alter table email_decodes    enable row level security;
alter table composed_emails  enable row level security;
alter table meeting_preps    enable row level security;
alter table discovery_notes  enable row level security;
alter table knowledge_items  enable row level security;
alter table user_settings    enable row level security;
alter table tasks            enable row level security;
alter table activity_logs    enable row level security;

-- ── Organization tables: users can access orgs they belong to ────────

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

-- ── Business data: org_id isolation with user_id fallback ────────────
-- Pattern: if user has an org, filter by org_id membership.
--          if org_id is null, allow access if user_id matches (pre-org data).

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

-- user_settings: strictly per-user (no org sharing)
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

-- Activity logs: read-only for owner/admin; service role inserts bypass RLS
create policy "admin_only_activity_logs" on activity_logs for select
  using (
    org_id in (
      select org_id from org_memberships
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Storage Bucket (for task attachments)
-- ═══════════════════════════════════════════════════════════════════════

-- Uncomment if you need file upload support for task attachments:
-- insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
--   on conflict (id) do nothing;
