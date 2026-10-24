-- Fresh PostgreSQL schema assembled from tracked source declarations. No data exports.
-- Canonical CRM IDs are text; native identities and organizations are UUID.

-- Source declarations: supabase/migrations/001_initial_schema.sql
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  logo_url text,
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Source declarations: supabase/migrations/001_initial_schema.sql
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  created_at timestamptz default now()
);

-- Source declarations: supabase/migrations/001_initial_schema.sql, supabase/migrations/007_add_job_title.sql, supabase/migrations/20260328_add_job_level.sql, supabase/migrations/20260514062000_fix_local_qa_schema_gaps.sql, src/lib/migrations/006_enterprise_permissions.sql
CREATE TABLE IF NOT EXISTS public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  org_id uuid not null,
  team_id uuid,
  role text not null check (role in ('owner', 'admin', 'manager', 'member')),
  display_name text,
  invited_by uuid,
  joined_at timestamptz default now(),
  unique(user_id, org_id),
  job_title text default 'ae',
  job_level integer NOT NULL DEFAULT 0,
  role_level integer,
  reports_to_user uuid
);

-- Source declarations: supabase/migrations/001_initial_schema.sql
CREATE TABLE IF NOT EXISTS public.org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'member')),
  token text unique not null,
  invited_by uuid,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz default now()
);

-- Source declarations: supabase/migrations/002_business_tables.sql, supabase/migrations/20260322000000_initial_schema.sql, supabase/migrations/20260401000000_add_account_competitors.sql, supabase/migrations/20260513170000_account_team_intelligence_p0.sql, supabase/migrations/20260514062000_fix_local_qa_schema_gaps.sql, src/lib/migrations/006_enterprise_permissions.sql
CREATE TABLE IF NOT EXISTS public.accounts (
  id text primary key,
  user_id uuid,
  org_id uuid,
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
  created_at timestamptz default now(),
  competitors jsonb DEFAULT '[]'::jsonb,
  business_team_id uuid,
  owner_id uuid,
  visibility text default 'org',
  ownership_changed_at timestamptz,
  ownership_changed_by uuid,
  last_activity_at timestamptz DEFAULT now()
);

-- Source declarations: supabase/migrations/002_business_tables.sql, supabase/migrations/20260322000000_initial_schema.sql, supabase/migrations/20260506120000_strategic_play_schema_v1.sql, supabase/migrations/20260514062000_fix_local_qa_schema_gaps.sql, src/lib/migrations/018_contact_role_enrichment.sql
CREATE TABLE IF NOT EXISTS public.contacts (
  id text primary key,
  user_id uuid,
  org_id uuid,
  account_id text,
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
  created_at timestamptz default now(),
  updated_at timestamptz,
  last_contacted_at timestamptz,
  relationship_strength integer DEFAULT 0,
  attitude_trend text,
  job_level integer,
  role_confidence numeric(5,2),
  role_updated_at timestamptz,
  role_source text,
  enrichment_status text DEFAULT 'pending',
  enrichment_sources jsonb DEFAULT '{}',
  enriched_at timestamptz
);

-- Source declarations: supabase/migrations/002_business_tables.sql, supabase/migrations/20260322000000_initial_schema.sql, supabase/migrations/20260514062000_fix_local_qa_schema_gaps.sql
CREATE TABLE IF NOT EXISTS public.opportunities (
  id text primary key,
  user_id uuid,
  org_id uuid,
  account_id text,
  name text not null,
  value numeric,
  currency text default 'USD',
  stage text,
  probability integer,
  expected_close_date text,
  owner text,
  source text,
  lost_reason text,
  won_date text,
  meddicc jsonb,
  mutual_action_plan jsonb,
  competitor_ids text[] default '{}',
  notes text,
  assigned_to uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  champion_contact_ids text[] default '{}',
  economic_buyer_contact_id text,
  visibility text default 'org'
);

-- Source declarations: supabase/migrations/002_business_tables.sql, supabase/migrations/20260322000000_initial_schema.sql, supabase/migrations/20260514062000_fix_local_qa_schema_gaps.sql, src/lib/migrations/018_contact_role_enrichment.sql
CREATE TABLE IF NOT EXISTS public.intel_items (
  id text primary key,
  user_id uuid,
  org_id uuid,
  account_id text,
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
  opportunity_id text,
  spin_classification jsonb,
  created_at timestamptz default now(),
  created_by uuid,
  writeback_status text,
  writeback_at timestamptz,
  writeback_fields jsonb
);

-- Source declarations: supabase/migrations/002_business_tables.sql, supabase/migrations/20260322000000_initial_schema.sql, supabase/migrations/20260401100000_add_email_decode_direction.sql, supabase/migrations/20260514025000_relationship_intelligence_foundation.sql, src/lib/migrations/024_signal_status.sql
CREATE TABLE IF NOT EXISTS public.email_decodes (
  id text primary key,
  user_id uuid,
  org_id uuid,
  account_id text,
  account_name text,
  opportunity_id text,
  email_text text,
  client_name text,
  deal_stage text,
  decode jsonb,
  strategy jsonb,
  date text,
  original_sender_email text,
  original_sender_name text,
  matched_contact_id text,
  matched_account_id text,
  matched_account_name text,
  created_at timestamptz default now(),
  direction text DEFAULT 'inbound',
  signal_source text,
  analysis_goal text,
  signal_context text,
  signal_status text not null default 'new',
  signal_task_id text,
  signal_status_updated_at timestamptz
);

-- Source declarations: supabase/migrations/002_business_tables.sql, supabase/migrations/20260322000000_initial_schema.sql
CREATE TABLE IF NOT EXISTS public.composed_emails (
  id text primary key,
  user_id uuid,
  org_id uuid,
  account_id text,
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

-- Source declarations: supabase/migrations/002_business_tables.sql, supabase/migrations/20260322000000_initial_schema.sql
CREATE TABLE IF NOT EXISTS public.meeting_preps (
  id text primary key,
  user_id uuid,
  org_id uuid,
  account_id text,
  input jsonb,
  result jsonb,
  created_at timestamptz default now()
);

-- Source declarations: supabase/migrations/002_business_tables.sql, supabase/migrations/20260322000000_initial_schema.sql
CREATE TABLE IF NOT EXISTS public.discovery_notes (
  id text primary key,
  user_id uuid,
  org_id uuid,
  opportunity_id text,
  date text,
  source text,
  content text,
  spin_classification jsonb,
  created_at timestamptz default now()
);

-- Source declarations: supabase/migrations/002_business_tables.sql, supabase/migrations/20260322000000_initial_schema.sql
CREATE TABLE IF NOT EXISTS public.knowledge_items (
  id text primary key,
  user_id uuid,
  org_id uuid,
  title text not null,
  content text,
  category text,
  file_size integer,
  created_at timestamptz default now()
);

-- Source declarations: supabase/migrations/002_business_tables.sql, supabase/migrations/20260322000000_initial_schema.sql, src/lib/migrations/012_user_settings.sql, supabase/migrations/20260404000000_update_user_settings_schema.sql, src/lib/migrations/039_user_language_choice.sql
CREATE TABLE IF NOT EXISTS public.user_settings (
  id text primary key,
  user_id uuid,
  org_id uuid,
  user_name text,
  role text,
  role_level text,
  gemini_key text,
  targets jsonb,
  created_at timestamptz default now(),
  display_name text,
  email text,
  role_description text,
  company_domain text,
  job_level integer DEFAULT 0,
  currency_code text DEFAULT 'CNY',
  quarterly_target numeric DEFAULT 0,
  monthly_target numeric DEFAULT 0,
  coverage_target numeric DEFAULT 3,
  notification_prefs jsonb DEFAULT '{"taskAssigned":true,"decodeComplete":true,"teamChange":true,"inApp":true}',
  locale text DEFAULT 'zh',
  updated_at timestamptz DEFAULT now(),
  pipeline_stages jsonb,
  chat_history jsonb,
  language_selected_at timestamptz
);

-- Source declarations: supabase/migrations/002_business_tables.sql, supabase/migrations/20260323000000_add_tasks.sql
CREATE TABLE IF NOT EXISTS public.tasks (
  id text primary key,
  user_id uuid,
  org_id uuid,
  account_id text,
  opportunity_id text,
  contact_id text,
  title text not null,
  description text,
  status text default 'todo',
  priority text default 'medium',
  due_date text,
  assigned_to uuid,
  source text,
  source_id text,
  ai_generated boolean default false,
  attachments jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Source declarations: supabase/migrations/005_activity_logs.sql
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  org_id uuid,
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

-- Source declarations: supabase/migrations/20260325_ai_advices.sql, supabase/migrations/20260404000200_ai_advices_daily.sql
CREATE TABLE IF NOT EXISTS public.ai_advices (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  org_id UUID,
  text TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('strategy', 'intel', 'meddicc')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'adopted', 'ignored', 'completed')),
  account_id TEXT,
  opportunity_id TEXT,
  task_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_at DATE
);

-- Source declarations: supabase/migrations/20260325_ai_advices.sql
CREATE TABLE IF NOT EXISTS public.decode_feedbacks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID NOT NULL,
  org_id UUID,
  decode_id TEXT NOT NULL,
  accurate BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Source declarations: supabase/migrations/20260402000000_account_knowledge_base.sql, src/lib/migrations/009_knowledge_base.sql, src/lib/migrations/020_knowledge_base_ai_source.sql
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  applicable_scenarios text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  embedding vector(1536),
  account_id text,
  org_id uuid,
  source text NOT NULL DEFAULT 'manual',
  source_type text DEFAULT NULL,
  source_id text DEFAULT NULL
);

-- Source declarations: supabase/migrations/20260402220000_add_contact_profiles_vector.sql
CREATE TABLE IF NOT EXISTS public.contact_profiles_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  linkedin_id TEXT,
  linkedin_url TEXT,
  name TEXT NOT NULL,
  headline TEXT,
  current_company TEXT,
  location TEXT,
  disc_primary TEXT CHECK (disc_primary IN ('D', 'I', 'S', 'C')),
  disc_secondary TEXT CHECK (disc_secondary IN ('D', 'I', 'S', 'C')),
  disc_confidence FLOAT DEFAULT 0,
  disc_evidence JSONB DEFAULT '[]',
  disc_approach TEXT,
  disc_risk_warnings JSONB DEFAULT '[]',
  optimal_channel TEXT DEFAULT 'linkedin_dm',
  opening_line_template TEXT,
  outreach_count INT DEFAULT 0,
  last_outreach_at TIMESTAMPTZ,
  last_outreach_result TEXT,
  successful_strategies JSONB DEFAULT '[]',
  raw_linkedin_data JSONB,
  notes TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, linkedin_id)
);

-- Source declarations: supabase/migrations/20260402220000_add_contact_profiles_vector.sql
CREATE TABLE IF NOT EXISTS public.outreach_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID,
  user_id UUID,
  strategy_name TEXT,
  message_text TEXT,
  channel TEXT,
  result TEXT CHECK (result IN ('positive', 'negative', 'neutral', 'pending')),
  response_received BOOLEAN DEFAULT FALSE,
  response_time_hours INT,
  meeting_booked BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Source declarations: supabase/migrations/20260402220000_add_contact_profiles_vector.sql
CREATE TABLE IF NOT EXISTS public.strategy_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  situation TEXT NOT NULL,
  target_type TEXT,
  disc_type TEXT,
  approach TEXT NOT NULL,
  opening_line TEXT,
  result TEXT CHECK (result IN ('success', 'failure', 'neutral')),
  why_it_worked TEXT,
  source TEXT,
  tags TEXT[],
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Source declarations: supabase/migrations/20260403080000_extend_intel_signals.sql
CREATE TABLE IF NOT EXISTS public.intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text,
  contact_id text,
  user_id UUID,
  content TEXT NOT NULL,
  signal_type TEXT,
  priority TEXT DEFAULT 'medium',
  triggered_by TEXT DEFAULT 'manual',
  source_url TEXT,
  expires_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Source declarations: supabase/migrations/20260404000100_ai_forecasts.sql, src/lib/migrations/021_ai_forecasts.sql
CREATE TABLE IF NOT EXISTS public.ai_forecasts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  org_id UUID,
  opportunity_id TEXT NOT NULL,
  ai_probability INTEGER NOT NULL,
  sales_probability INTEGER NOT NULL,
  gap INTEGER NOT NULL DEFAULT 0,
  factors JSONB DEFAULT '[]',
  risks JSONB DEFAULT '[]',
  recommendation TEXT DEFAULT '',
  dwell_days INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Source declarations: supabase/migrations/20260404001000_add_comments_table.sql
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  entity_type text not null check (entity_type in ('account', 'opportunity', 'contact')),
  entity_id text not null,
  content text not null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Source declarations: supabase/migrations/20260405000000_evidence_memory_v1.sql, src/lib/migrations/013_evidence_memory_v1.sql
CREATE TABLE IF NOT EXISTS public.source_records (
  id text primary key default gen_random_uuid(),
  org_id uuid,
  account_id text,
  source_kind text not null,
  source_table text,
  source_row_id text not null,
  title text,
  summary text,
  occurred_at timestamptz default now(),
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  unique (org_id, source_kind, source_row_id)
);

-- Source declarations: supabase/migrations/20260405000000_evidence_memory_v1.sql, src/lib/migrations/013_evidence_memory_v1.sql
CREATE TABLE IF NOT EXISTS public.account_memory_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  account_id text,
  narrative_summary text not null,
  momentum jsonb not null default '{}',
  people jsonb not null default '[]',
  tensions jsonb not null default '[]',
  timeline_highlights jsonb not null default '[]',
  snapshot_json jsonb not null default '{}',
  computed_at timestamptz default now()
);

-- Source declarations: supabase/migrations/20260405000000_evidence_memory_v1.sql, src/lib/migrations/013_evidence_memory_v1.sql
CREATE TABLE IF NOT EXISTS public.memory_conflicts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  account_id text,
  summary text not null,
  status text not null default 'open',
  source_ids text[] default '{}',
  detected_at timestamptz default now(),
  resolved_at timestamptz
);

-- Source declarations: supabase/migrations/20260405000200_compiled_intelligence_layer.sql, src/lib/migrations/014_compiled_intelligence_layer.sql
CREATE TABLE IF NOT EXISTS public.account_knowledge_pages (
  id text primary key default gen_random_uuid(),
  org_id uuid not null,
  account_id text not null,
  page_type text not null,
  title text not null default '',
  content_json jsonb not null default '{}',
  content_md text,
  version integer not null default 1,
  updated_by text not null default 'system',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(org_id, account_id, page_type)
);

-- Source declarations: supabase/migrations/20260405000200_compiled_intelligence_layer.sql, src/lib/migrations/014_compiled_intelligence_layer.sql
CREATE TABLE IF NOT EXISTS public.account_claims (
  id text primary key default gen_random_uuid(),
  org_id uuid not null,
  account_id text not null,
  claim_type text not null,
  statement text not null,
  status text not null default 'active',
  confidence numeric(5,2) default 0.5,
  supporting_evidence_ids jsonb not null default '[]',
  counter_evidence_ids jsonb not null default '[]',
  affected_object_ids jsonb not null default '[]',
  last_revalidated_at timestamptz default now(),
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Source declarations: supabase/migrations/20260405000200_compiled_intelligence_layer.sql, src/lib/migrations/014_compiled_intelligence_layer.sql
CREATE TABLE IF NOT EXISTS public.account_evidence (
  id text primary key default gen_random_uuid(),
  org_id uuid not null,
  account_id text not null,
  source_id text not null,
  source_type text not null,
  evidence_type text not null,
  quote_text text,
  summary text,
  speaker text,
  occurred_at timestamptz,
  relevance_score numeric(5,2) default 0.5,
  linked_claim_ids jsonb not null default '[]',
  linked_page_types jsonb not null default '[]',
  metadata jsonb not null default '{}',
  created_at timestamptz default now()
);

-- Source declarations: supabase/migrations/20260405000200_compiled_intelligence_layer.sql, src/lib/migrations/014_compiled_intelligence_layer.sql
CREATE TABLE IF NOT EXISTS public.account_open_questions (
  id text primary key default gen_random_uuid(),
  org_id uuid not null,
  account_id text not null,
  question text not null,
  priority text not null default 'medium',
  status text not null default 'open',
  related_objects jsonb not null default '[]',
  blocking_outputs jsonb not null default '[]',
  answer text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  resolved_at timestamptz
);

-- Source declarations: supabase/migrations/20260405000200_compiled_intelligence_layer.sql, src/lib/migrations/014_compiled_intelligence_layer.sql
CREATE TABLE IF NOT EXISTS public.knowledge_update_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  account_id text not null,
  trigger_source_id text,
  update_type text not null default 'ingest',
  changed_pages jsonb not null default '[]',
  changed_claims jsonb not null default '[]',
  summary text,
  created_at timestamptz default now()
);

-- Source declarations: supabase/migrations/20260418000000_database_fixes.sql
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);

-- Source declarations: supabase/migrations/20260428000000_ai_invocation_logs.sql
CREATE TABLE IF NOT EXISTS public.ai_invocation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NULL,
  user_id uuid NULL,
  account_id text NULL,
  opportunity_id text NULL,
  route text NULL,
  use_case text NULL,
  tier text NULL,
  model text NULL,
  provider text NULL,
  status text NOT NULL CHECK (status IN ('success', 'error', 'degraded')),
  prompt_tokens integer NULL CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  completion_tokens integer NULL CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
  total_tokens integer NULL CHECK (total_tokens IS NULL OR total_tokens >= 0),
  duration_ms integer NULL CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_message text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Source declarations: supabase/migrations/20260506120000_strategic_play_schema_v1.sql, src/lib/migrations/002_strategic_plays.sql, supabase/migrations/20260401200000_add_play_deadline.sql, supabase/migrations/20260506120100_strategic_play_evidence_trace.sql, supabase/migrations/20260611211000_strategic_play_route_plan_v2.sql, src/lib/migrations/play-v2.sql
CREATE TABLE IF NOT EXISTS public.strategic_plays (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid,
  account_id text NOT NULL,
  opportunity_id text,
  target_contact_id text,
  goal_type text NOT NULL,
  goal_description text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]',
  alternative_paths jsonb DEFAULT '[]',
  confidence numeric(5,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  ai_model text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deadline timestamptz,
  key_milestones jsonb DEFAULT '[]'::jsonb,
  situation_judgment text,
  strategic_objective text,
  stakeholder_path jsonb DEFAULT '[]'::jsonb,
  evidence_basis jsonb DEFAULT '[]'::jsonb,
  risk_counter_evidence jsonb DEFAULT '[]'::jsonb,
  knowledge_traces jsonb DEFAULT '[]'::jsonb,
  knowledge_gaps jsonb DEFAULT '[]'::jsonb,
  evidence_provenance jsonb,
  situation_layers jsonb DEFAULT '[]'::jsonb,
  confidence_profile jsonb DEFAULT '{}'::jsonb,
  win_gaps jsonb DEFAULT '[]'::jsonb,
  next_verification_point text,
  play_versions jsonb DEFAULT '[]'::jsonb,
  momentum text DEFAULT 'active',
  success_criteria text,
  assumptions jsonb DEFAULT '[]'::jsonb,
  learnings jsonb DEFAULT '[]'::jsonb,
  review jsonb,
  last_step_at timestamptz,
  days_since_progress integer DEFAULT 0
);

-- Source declarations: supabase/migrations/20260513170000_account_team_intelligence_p0.sql, src/lib/migrations/027_account_team_intelligence_p0.sql
CREATE TABLE IF NOT EXISTS public.pursuit_teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parent_team_id uuid,
  account_id text not null,
  opportunity_id text,
  strategic_play_id text,
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'closed', 'archived')),
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Source declarations: supabase/migrations/20260513170000_account_team_intelligence_p0.sql, src/lib/migrations/027_account_team_intelligence_p0.sql
CREATE TABLE IF NOT EXISTS public.responsibility_catalog (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  key text not null,
  label text not null,
  description text,
  category text,
  is_system boolean not null default false,
  created_by uuid,
  created_at timestamptz default now(),
  constraint responsibility_catalog_system_org_check check ((is_system = true and org_id is null) or (is_system = false and org_id is not null))
);

-- Source declarations: supabase/migrations/20260513170000_account_team_intelligence_p0.sql, src/lib/migrations/027_account_team_intelligence_p0.sql
CREATE TABLE IF NOT EXISTS public.pursuit_team_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  pursuit_team_id uuid not null,
  user_id uuid not null,
  is_lead boolean not null default false,
  coverage_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (pursuit_team_id, user_id)
);

-- Source declarations: supabase/migrations/20260513170000_account_team_intelligence_p0.sql, src/lib/migrations/027_account_team_intelligence_p0.sql
CREATE TABLE IF NOT EXISTS public.pursuit_team_member_responsibilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  pursuit_team_member_id uuid not null,
  responsibility_id uuid not null,
  created_at timestamptz default now(),
  unique (pursuit_team_member_id, responsibility_id)
);

-- Source declarations: supabase/migrations/20260513170000_account_team_intelligence_p0.sql, src/lib/migrations/027_account_team_intelligence_p0.sql, supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
CREATE TABLE IF NOT EXISTS public.contact_coverage_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  pursuit_team_id uuid not null,
  account_id text not null,
  contact_id text not null,
  primary_user_id uuid,
  backup_user_id uuid,
  relationship_goal text,
  relationship_status text not null default 'unknown' check (relationship_status in ('unknown', 'cold', 'warming', 'trusted', 'champion', 'blocker', 'risk')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (pursuit_team_id, contact_id),
  coverage_health text not null default 'unknown' check (coverage_health in ('unknown', 'healthy', 'thin', 'stale', 'gap', 'risk', 'needs_review')),
  desired_relationship_status text check (desired_relationship_status in ('unknown', 'introduced', 'engaged', 'familiar', 'trusted', 'can_introduce', 'champion')),
  cadence_days integer check (cadence_days is null or cadence_days > 0),
  last_touch_at timestamptz,
  next_touch_due_at timestamptz,
  last_signal_id uuid,
  confidence numeric(4,3) not null default 0.000 check (confidence >= 0 and confidence <= 1),
  risk_reasons jsonb not null default '[]',
  reviewed_at timestamptz
);

-- Source declarations: supabase/migrations/20260513170000_account_team_intelligence_p0.sql, src/lib/migrations/027_account_team_intelligence_p0.sql
CREATE TABLE IF NOT EXISTS public.contact_coverage_responsibilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  contact_coverage_assignment_id uuid not null,
  responsibility_id uuid not null,
  created_at timestamptz default now(),
  unique (contact_coverage_assignment_id, responsibility_id)
);

-- Source declarations: supabase/migrations/20260514025000_relationship_intelligence_foundation.sql, src/lib/migrations/028_relationship_intelligence_foundation.sql
CREATE TABLE IF NOT EXISTS public.relationship_signals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  account_id text not null,
  opportunity_id text,
  contact_id text,
  actor_user_id uuid,
  signal_kind text not null check (signal_kind in ('forwarded_email_decode', 'email_interaction', 'meeting', 'manual_note', 'coverage_update', 'profile_hint')),
  valence text not null default 'neutral' check (valence in ('positive', 'neutral', 'negative', 'mixed', 'unknown')),
  strength integer not null default 20 check (strength >= 0 and strength <= 100),
  confidence numeric(4,3) not null default 0.500 check (confidence >= 0 and confidence <= 1),
  summary text not null,
  quote_text text,
  source_record_id text,
  source_table text,
  source_row_id text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Source declarations: supabase/migrations/20260514025000_relationship_intelligence_foundation.sql, src/lib/migrations/028_relationship_intelligence_foundation.sql
CREATE TABLE IF NOT EXISTS public.relationship_edges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  account_id text not null,
  opportunity_id text,
  from_entity_type text not null default 'user' check (from_entity_type in ('user', 'contact', 'team', 'unknown')),
  from_user_id uuid,
  from_contact_id text,
  to_contact_id text not null,
  edge_type text not null default 'communication' check (edge_type in ('communication', 'trust', 'influence', 'coverage', 'risk')),
  relationship_status text not null default 'unknown' check (relationship_status in ('unknown', 'none', 'introduced', 'engaged', 'familiar', 'trusted', 'can_introduce', 'risk')),
  strength integer not null default 0 check (strength >= 0 and strength <= 100),
  trend text not null default 'unknown' check (trend in ('rising', 'steady', 'cooling', 'stale', 'unknown')),
  confidence numeric(4,3) not null default 0.000 check (confidence >= 0 and confidence <= 1),
  signal_count integer not null default 0 check (signal_count >= 0),
  last_signal_at timestamptz,
  evidence_refs jsonb not null default '[]',
  computed_at timestamptz not null default now(),
  stale_after timestamptz,
  status_flags text[] not null default '{}',
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Source declarations: supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
CREATE TABLE IF NOT EXISTS public.pallas_artifacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid,
  kind text not null check (kind in (
    'customer_research_card',
    'strategic_play_action_board',
    'communication_draft_preview',
    'evidence_pack',
    'ask_data_result'
  )),
  title text not null,
  entity_type text not null check (entity_type in (
    'account',
    'contact',
    'opportunity',
    'strategic_play',
    'task',
    'global'
  )),
  entity_id text,
  account_id text,
  contact_id text,
  opportunity_id text,
  strategic_play_id text,
  data jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Source declarations: supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
CREATE TABLE IF NOT EXISTS public.pallas_artifact_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  artifact_id uuid not null,
  version integer not null,
  data jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (artifact_id, version)
);

-- Source declarations: supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql, supabase/migrations/20260517113000_pallas_action_proposal_reuse_key.sql
CREATE TABLE IF NOT EXISTS public.pallas_action_proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid,
  artifact_id uuid,
  conversation_id text not null,
  entity_type text not null check (entity_type in (
    'account',
    'contact',
    'opportunity',
    'strategic_play',
    'task',
    'global'
  )),
  entity_id text,
  account_id text,
  contact_id text,
  opportunity_id text,
  strategic_play_id text,
  status text not null default 'draft' check (status in (
    'draft',
    'awaiting_confirmation',
    'confirmed',
    'executing',
    'succeeded',
    'failed',
    'rejected',
    'expired'
  )),
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'external')),
  actions jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  confirmed_at timestamptz,
  confirmed_by uuid,
  result_summary text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reuse_key text
);

-- Source declarations: supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
CREATE TABLE IF NOT EXISTS public.pallas_tool_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  proposal_id uuid not null,
  tool_name text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- Source declarations: supabase/migrations/20260517224000_judgment_ownership_assignments.sql
CREATE TABLE IF NOT EXISTS public.judgment_ownership_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  account_id text not null,
  opportunity_id text null,
  strategic_play_id text null,
  judgment_type text not null check (judgment_type in (
    'account_strategy',
    'opportunity_forecast',
    'strategic_play',
    'relationship_coverage',
    'evidence_verification',
    'calibration_review'
  )),
  assigned_user_id uuid not null,
  assigned_by uuid null,
  status text not null default 'active' check (status in ('active', 'completed', 'revoked')),
  source text not null default 'manual' check (source in ('manual', 'management_queue', 'strategic_play', 'decode_signal', 'rfp_signal')),
  reason text null,
  due_at timestamptz null,
  completed_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Source declarations: supabase/migrations/20260611205000_leads_persistence.sql, src/lib/migrations/034_leads_persistence.sql
CREATE TABLE IF NOT EXISTS public.leads (
  id text primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid,
  owner_id uuid,
  company_name text not null,
  contact_name text not null,
  email text,
  phone text,
  title text,
  source text not null default 'manual',
  need text not null,
  estimated_value numeric not null default 0,
  currency text not null default 'CNY',
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'new' check (status in ('new', 'qualified', 'nurture', 'disqualified', 'converted')),
  next_step text,
  notes text,
  converted_at timestamptz,
  converted_account_id text,
  converted_contact_id text,
  converted_opportunity_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Source declarations: supabase/migrations/20260612013000_contact_opportunity_roles.sql, src/lib/migrations/035_contact_opportunity_roles.sql
CREATE TABLE IF NOT EXISTS public.contact_opportunity_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  contact_id text not null,
  opportunity_id text not null,
  role_type text not null default 'unknown' check (role_type in (
    'decision_maker',
    'economic_buyer',
    'champion',
    'technical_evaluator',
    'influencer',
    'external_advisor',
    'consultant',
    'channel_influencer',
    'blocker',
    'end_user',
    'procurement',
    'legal',
    'project_manager',
    'executive_sponsor',
    'gate_keeper',
    'coach',
    'committee_member',
    'it_admin',
    'operations',
    'finance',
    'contact',
    'unknown'
  )),
  influence_level text not null default 'unknown' check (influence_level in ('high', 'medium', 'low', 'unknown')),
  stance text not null default 'unknown' check (stance in ('supportive', 'neutral', 'risk', 'unknown')),
  engagement_status text not null default 'missing' check (engagement_status in ('covered', 'needs_touch', 'missing')),
  last_engaged_at timestamptz,
  relationship_owner_id uuid,
  source_evidence_ids text[] not null default '{}',
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, opportunity_id)
);

-- Source declarations: supabase/migrations/20260612014000_timeline_events.sql, src/lib/migrations/036_timeline_events.sql
CREATE TABLE IF NOT EXISTS public.timeline_events (
  id text primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid,
  account_id text,
  opportunity_id text,
  contact_id text,
  type text not null check (type in ('email', 'meeting', 'call', 'chat', 'intel', 'task', 'stage_change', 'close_date', 'document', 'note')),
  occurred_at timestamptz not null default now(),
  title text not null,
  actor text,
  detail text,
  source_table text,
  source_row_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Source declarations: supabase/migrations/20260612014000_timeline_events.sql, src/lib/migrations/036_timeline_events.sql
CREATE TABLE IF NOT EXISTS public.timeline_event_links (
  id text primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id text not null,
  entity_type text not null check (entity_type in ('account', 'opportunity', 'contact')),
  entity_id text not null,
  created_at timestamptz not null default now(),
  unique (event_id, entity_type, entity_id)
);

-- Source declarations: supabase/migrations/20260612014000_timeline_events.sql, src/lib/migrations/036_timeline_events.sql
CREATE TABLE IF NOT EXISTS public.opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  opportunity_id text not null,
  old_stage text,
  new_stage text not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);

-- Source declarations: supabase/migrations/20260612014000_timeline_events.sql, src/lib/migrations/036_timeline_events.sql
CREATE TABLE IF NOT EXISTS public.opportunity_close_date_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  opportunity_id text not null,
  old_close_date text,
  new_close_date text not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);

-- Source declarations: src/lib/migrations/001_ai_event_pipeline.sql
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  insight_type text not null,
  data jsonb not null default '{}',
  version integer not null default 1,
  last_trigger text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(org_id, entity_type, entity_id, insight_type)
);

-- Source declarations: src/lib/migrations/001_ai_event_pipeline.sql
CREATE TABLE IF NOT EXISTS public.ai_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending',
  error text,
  processed_at timestamptz,
  created_at timestamptz default now()
);

-- Source declarations: src/lib/migrations/003_channel_partners.sql
CREATE TABLE IF NOT EXISTS public.channel_partners (
  id text primary key,
  org_id uuid,
  user_id uuid,
  name text not null,
  type text not null,
  tier text default 'registered',
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

-- Source declarations: src/lib/migrations/003_channel_partners.sql
CREATE TABLE IF NOT EXISTS public.deal_registrations (
  id text primary key,
  org_id uuid,
  user_id uuid,
  partner_id text,
  partner_name text,
  account_name text not null,
  deal_value numeric default 0,
  status text default 'pending',
  submitted_at timestamptz default now(),
  expires_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- Source declarations: src/lib/migrations/005_quota_forecast.sql
CREATE TABLE IF NOT EXISTS public.quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid,
  team_id uuid,
  period_type text NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  target_amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'USD',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Source declarations: src/lib/migrations/005_quota_forecast.sql
CREATE TABLE IF NOT EXISTS public.forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  closed numeric DEFAULT 0,
  commit numeric DEFAULT 0,
  best_case numeric DEFAULT 0,
  pipeline numeric DEFAULT 0,
  ai_predicted numeric,
  notes text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, user_id, period_start, period_end)
);

-- Source declarations: src/lib/migrations/006_enterprise_permissions.sql
CREATE TABLE IF NOT EXISTS public.org_wide_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  object_type text NOT NULL,
  default_access text NOT NULL DEFAULT 'private'
    CHECK (default_access IN ('private', 'read_only', 'read_write', 'full')),
  UNIQUE(org_id, object_type)
);

-- Source declarations: src/lib/migrations/006_enterprise_permissions.sql
CREATE TABLE IF NOT EXISTS public.record_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  object_type text NOT NULL,
  record_id text NOT NULL,
  shared_with_type text NOT NULL CHECK (shared_with_type IN ('user', 'team')),
  shared_with_id uuid NOT NULL,
  access_level text NOT NULL DEFAULT 'read_only' CHECK (access_level IN ('read_only', 'read_write')),
  shared_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  UNIQUE(org_id, object_type, record_id, shared_with_type, shared_with_id)
);

-- Source declarations: src/lib/migrations/006_enterprise_permissions.sql
CREATE TABLE IF NOT EXISTS public.ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  object_type text NOT NULL,
  record_id text NOT NULL,
  from_user uuid,
  to_user uuid,
  reason text,
  transferred_by uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Source declarations: src/lib/migrations/006_enterprise_permissions.sql
CREATE TABLE IF NOT EXISTS public.pool_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  inactive_days integer DEFAULT 30,
  no_deal_days integer,
  max_accounts_per_user integer DEFAULT 50,
  cooldown_hours integer DEFAULT 24,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Source declarations: src/lib/migrations/006_enterprise_permissions.sql
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  object_type text NOT NULL,
  record_id text,
  record_name text,
  changes jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Source declarations: src/lib/migrations/006_integration_tables.sql
CREATE TABLE IF NOT EXISTS public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  connector_id text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  config jsonb NOT NULL DEFAULT '{}',
  instance_url text,
  scopes text[],
  connected_at timestamptz,
  connected_by uuid,
  last_sync_at timestamptz,
  sync_status text DEFAULT 'idle',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, connector_id)
);

-- Source declarations: src/lib/migrations/006_integration_tables.sql, src/lib/migrations/011_integration_fixes.sql
CREATE TABLE IF NOT EXISTS public.integration_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  expires_at timestamptz NOT NULL,
  token_type text DEFAULT 'Bearer',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  org_id uuid
);

-- Source declarations: src/lib/migrations/006_integration_tables.sql
CREATE TABLE IF NOT EXISTS public.integration_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  object_type text NOT NULL,
  last_sync_at timestamptz,
  cursor jsonb DEFAULT '{}',
  record_count integer DEFAULT 0,
  status text DEFAULT 'idle',
  error_message text,
  UNIQUE(connection_id, object_type)
);

-- Source declarations: src/lib/migrations/006_integration_tables.sql
CREATE TABLE IF NOT EXISTS public.integration_emails (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  message_id text NOT NULL,
  sender text NOT NULL,
  to_recipients text[] DEFAULT '{}',
  cc_recipients text[] DEFAULT '{}',
  subject text,
  received_at timestamptz NOT NULL,
  synced_from text,
  visible_to text[] DEFAULT '{}',
  summary text,
  sentiment text,
  intent text,
  key_info jsonb DEFAULT '[]',
  account_id text,
  contact_id text,
  opportunity_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, message_id)
);

-- Source declarations: src/lib/migrations/006_integration_tables.sql
CREATE TABLE IF NOT EXISTS public.integration_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid,
  connection_id uuid,
  connector_id text NOT NULL,
  action text NOT NULL,
  object_type text,
  record_count integer,
  details jsonb,
  status text NOT NULL,
  error_message text,
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);

-- Source declarations: src/lib/migrations/006_integration_tables.sql
CREATE TABLE IF NOT EXISTS public.agent_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid,
  type text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  body text,
  actions jsonb DEFAULT '[]',
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Source declarations: src/lib/migrations/007_products_quotes.sql
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  sku text,
  description text,
  unit_price numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'USD',
  category text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Source declarations: src/lib/migrations/007_products_quotes.sql
CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  opportunity_id text,
  account_id text,
  quote_number text,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  valid_until date,
  subtotal numeric DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  tax_percent numeric DEFAULT 0,
  total numeric DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Source declarations: src/lib/migrations/007_products_quotes.sql
CREATE TABLE IF NOT EXISTS public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  product_id uuid,
  name text NOT NULL,
  description text,
  quantity numeric DEFAULT 1,
  unit_price numeric DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  total numeric DEFAULT 0,
  sort_order integer DEFAULT 0
);

-- Source declarations: src/lib/migrations/008_meeting_recordings.sql
CREATE TABLE IF NOT EXISTS public.meeting_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  account_id text,
  title TEXT NOT NULL,
  meeting_date TIMESTAMPTZ DEFAULT now(),
  attendee_contact_ids JSONB DEFAULT '[]',
  context TEXT,
  audio_url TEXT,
  duration_seconds INT,
  transcript JSONB,
  decode_result JSONB,
  status TEXT DEFAULT 'uploading' CHECK (status IN ('uploading', 'transcribing', 'decoding', 'done', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Source declarations: src/lib/migrations/010_wecom_data_tables.sql
CREATE TABLE IF NOT EXISTS public.integration_wecom_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  external_userid text NOT NULL,
  name text NOT NULL,
  corp_name text,
  corp_full_name text,
  position text,
  avatar text,
  follow_userid text,
  follow_remark text,
  follow_description text,
  add_time timestamptz,
  tags text[] DEFAULT '{}',
  account_id text,
  contact_id text,
  raw_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, external_userid)
);

-- Source declarations: src/lib/migrations/010_wecom_data_tables.sql
CREATE TABLE IF NOT EXISTS public.integration_wecom_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  chat_id text NOT NULL,
  name text,
  owner_userid text,
  create_time timestamptz,
  member_count integer DEFAULT 0,
  external_member_count integer DEFAULT 0,
  member_list jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, chat_id)
);

-- Source declarations: src/lib/migrations/018_contact_role_enrichment.sql
CREATE TABLE IF NOT EXISTS public.opportunity_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  opportunity_id  text NOT NULL,
  contact_id      text NOT NULL,
  deal_role       text NOT NULL,
  confidence      numeric(5,2) DEFAULT 0.5,
  source          text NOT NULL DEFAULT 'manual',
  evidence        text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Source declarations: src/lib/migrations/018_contact_role_enrichment.sql
CREATE TABLE IF NOT EXISTS public.contact_enrichment_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  contact_id    text NOT NULL,
  action        text NOT NULL,
  field_name    text NOT NULL,
  old_value     text,
  new_value     text NOT NULL,
  confidence    numeric(5,2),
  source        text NOT NULL,
  source_id     text,
  evidence      text,
  created_by    uuid,
  created_at    timestamptz DEFAULT now()
);

-- Source declarations: src/lib/migrations/019_rfp_system.sql
CREATE TABLE IF NOT EXISTS public.rfps (
  id text primary key default gen_random_uuid(),
  org_id uuid not null,
  opportunity_id text not null,
  account_id text not null,
  linked_play_id text,
  title          text not null,
  issuer         text not null default '',
  issued_date    date,
  due_date       date,
  status         text not null default 'identified',
  budget         numeric(18,2),
  currency       text not null default 'CNY',
  requirements   jsonb not null default '[]',
  notes          text not null default '',
  created_by     uuid,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- Source declarations: src/lib/migrations/019_rfp_system.sql
CREATE TABLE IF NOT EXISTS public.rfp_documents (
  id text primary key default gen_random_uuid(),
  org_id uuid not null,
  rfp_id text not null,
  name        text not null,
  doc_type    text not null default 'other',
  url         text,
  file_size   bigint,
  uploaded_by uuid,
  created_at  timestamptz default now()
);

-- Source declarations: src/lib/migrations/019_rfp_system.sql
CREATE TABLE IF NOT EXISTS public.rfp_milestones (
  id text primary key default gen_random_uuid(),
  org_id uuid not null,
  rfp_id text not null,
  title       text not null,
  due_date    date,
  status      text not null default 'pending',
  assigned_to uuid,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Source declarations: src/lib/migrations/019_rfp_system.sql
CREATE TABLE IF NOT EXISTS public.rfp_competitors (
  id text primary key default gen_random_uuid(),
  org_id uuid not null,
  rfp_id text not null,
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

-- Source declarations: src/lib/migrations/019_rfp_system.sql
CREATE TABLE IF NOT EXISTS public.rfp_ai_analyses (
  id text primary key default gen_random_uuid(),
  org_id uuid not null,
  rfp_id text not null,
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

-- Source declarations: src/lib/migrations/022_dashboard_config.sql
CREATE TABLE IF NOT EXISTS public.org_dashboard_configs (
  id          uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  role_level  text not null check (role_level in ('ae', 'ae-lead', 'director', 'executive', 'owner')),
  module_configs jsonb not null default '[]',
  updated_by  uuid,
  updated_at  timestamptz default now(),
  unique (org_id, role_level)
);

-- Source declarations: src/lib/migrations/033_crm_import_governance.sql
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid,
  object_type text NOT NULL CHECK (object_type IN ('accounts', 'contacts')),
  source_filename text,
  status text NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed', 'published', 'failed')),
  row_count integer NOT NULL DEFAULT 0,
  create_count integer NOT NULL DEFAULT 0,
  update_count integer NOT NULL DEFAULT 0,
  conflict_count integer NOT NULL DEFAULT 0,
  skip_count integer NOT NULL DEFAULT 0,
  finding_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

-- Source declarations: src/lib/migrations/033_crm_import_governance.sql
CREATE TABLE IF NOT EXISTS public.import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  import_job_id uuid NOT NULL,
  row_index integer NOT NULL,
  source_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapped_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  planned_action text NOT NULL CHECK (planned_action IN ('create', 'update', 'skip', 'conflict')),
  result_status text NOT NULL DEFAULT 'pending' CHECK (result_status IN ('pending', 'created', 'updated', 'skipped', 'failed')),
  result_entity_type text,
  result_entity_id uuid,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(import_job_id, row_index)
);

-- Source declarations: src/lib/migrations/033_crm_import_governance.sql
CREATE TABLE IF NOT EXISTS public.field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  import_job_id uuid NOT NULL,
  object_type text NOT NULL CHECK (object_type IN ('accounts', 'contacts')),
  closr_field text NOT NULL,
  source_field text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(import_job_id, closr_field)
);

-- Source declarations: src/lib/migrations/033_crm_import_governance.sql
CREATE TABLE IF NOT EXISTS public.duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  import_job_id uuid NOT NULL,
  import_row_index integer NOT NULL,
  imported_name text NOT NULL,
  existing_entity_type text NOT NULL CHECK (existing_entity_type IN ('account', 'contact')),
  existing_entity_id uuid,
  existing_name text NOT NULL,
  match_type text NOT NULL CHECK (match_type IN ('name', 'email', 'website')),
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium')),
  recommendation text NOT NULL CHECK (recommendation IN ('merge', 'review')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Source declarations: src/lib/migrations/033_crm_import_governance.sql
CREATE TABLE IF NOT EXISTS public.merge_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  import_job_id uuid NOT NULL,
  import_row_index integer NOT NULL,
  decision text NOT NULL CHECK (decision IN ('merge', 'skip', 'keep_both', 'defer')),
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  rationale text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Source declarations: src/lib/migrations/033_crm_import_governance.sql
CREATE TABLE IF NOT EXISTS public.data_quality_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  import_job_id uuid,
  import_row_index integer,
  entity_type text,
  entity_id text,
  field text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  label text NOT NULL,
  detail text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  created_by uuid,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Source declarations: src/lib/migrations/038_engine_core.sql
CREATE TABLE IF NOT EXISTS public.engine_source_records (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('email', 'meeting', 'call', 'chat', 'rfp', 'crm_note', 'document', 'news', 'task', 'outcome')),
  external_source_id text,
  account_id text,
  opportunity_id text,
  contact_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  occurred_at timestamptz NOT NULL,
  author_side text CHECK (author_side IN ('customer', 'seller', 'partner', 'external', 'unknown')),
  author_name text,
  author_email text,
  content text,
  content_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Source declarations: src/lib/migrations/038_engine_core.sql
CREATE TABLE IF NOT EXISTS public.engine_evidence_refs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  source_record_id text NOT NULL,
  evidence_type text NOT NULL CHECK (evidence_type IN ('support', 'counter', 'missing', 'context')),
  quote text NOT NULL,
  summary text NOT NULL,
  quality_score numeric NOT NULL DEFAULT 0,
  freshness_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Source declarations: src/lib/migrations/038_engine_core.sql
CREATE TABLE IF NOT EXISTS public.engine_judgments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  account_id text NOT NULL,
  opportunity_id text,
  dimension text NOT NULL,
  answer text NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'accepted', 'challenged', 'revised', 'invalidated', 'confirmed')),
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  impact text NOT NULL CHECK (impact IN ('low', 'medium', 'high', 'critical')),
  support_evidence_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  counter_evidence_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  missing_evidence text[] NOT NULL DEFAULT ARRAY[]::text[],
  rationale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Source declarations: src/lib/migrations/038_engine_core.sql
CREATE TABLE IF NOT EXISTS public.engine_win_gaps (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  account_id text NOT NULL,
  opportunity_id text,
  dimension text NOT NULL,
  current_state text NOT NULL,
  desired_state text NOT NULL,
  impact text NOT NULL,
  linked_judgment_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence_gap text NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'addressed', 'invalidated', 'accepted_risk')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Source declarations: src/lib/migrations/038_engine_core.sql
CREATE TABLE IF NOT EXISTS public.engine_moves (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  account_id text NOT NULL,
  opportunity_id text,
  win_gap_id text NOT NULL,
  intent text NOT NULL,
  target_person text NOT NULL,
  ask text NOT NULL,
  expected_judgment_delta text NOT NULL,
  success_test text NOT NULL,
  failure_test text NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'approved', 'in_progress', 'done', 'failed', 'skipped')),
  approval_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Source declarations: src/lib/migrations/038_engine_core.sql
CREATE TABLE IF NOT EXISTS public.engine_audit_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  actor_id text,
  actor_type text NOT NULL DEFAULT 'engine' CHECK (actor_type IN ('user', 'service', 'engine', 'connector')),
  event_type text NOT NULL,
  object_type text NOT NULL,
  object_id text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Source declarations: src/lib/migrations/play-v2.sql
CREATE TABLE IF NOT EXISTS public.play_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  source_play_id text NOT NULL,
  target_play_id text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('supports', 'depends_on', 'conflicts')),
  note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (source_play_id, target_play_id, relationship)
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_native_reference_key ON public.accounts (id, org_id);

CREATE UNIQUE INDEX IF NOT EXISTS contact_coverage_assignments_native_reference_key ON public.contact_coverage_assignments (id, org_id);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_native_reference_key ON public.contacts (id, org_id);

CREATE UNIQUE INDEX IF NOT EXISTS opportunities_native_reference_key ON public.opportunities (id, org_id);

CREATE UNIQUE INDEX IF NOT EXISTS pallas_action_proposals_native_reference_key ON public.pallas_action_proposals (id, org_id);

CREATE UNIQUE INDEX IF NOT EXISTS pallas_artifacts_native_reference_key ON public.pallas_artifacts (id, org_id);

CREATE UNIQUE INDEX IF NOT EXISTS pursuit_team_members_native_reference_key ON public.pursuit_team_members (id, org_id);

CREATE UNIQUE INDEX IF NOT EXISTS pursuit_teams_native_reference_key ON public.pursuit_teams (id, org_id);

CREATE UNIQUE INDEX IF NOT EXISTS strategic_plays_native_reference_key ON public.strategic_plays (id, org_id);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pursuit_teams_account_org_fk' AND conrelid='public.pursuit_teams'::regclass) THEN ALTER TABLE public.pursuit_teams ADD constraint pursuit_teams_account_org_fk foreign key (account_id, org_id) references accounts(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pursuit_team_members_team_org_fk' AND conrelid='public.pursuit_team_members'::regclass) THEN ALTER TABLE public.pursuit_team_members ADD constraint pursuit_team_members_team_org_fk foreign key (pursuit_team_id, org_id) references pursuit_teams(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pursuit_team_member_responsibilities_member_org_fk' AND conrelid='public.pursuit_team_member_responsibilities'::regclass) THEN ALTER TABLE public.pursuit_team_member_responsibilities ADD constraint pursuit_team_member_responsibilities_member_org_fk foreign key (pursuit_team_member_id, org_id) references pursuit_team_members(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_coverage_assignments_team_org_fk' AND conrelid='public.contact_coverage_assignments'::regclass) THEN ALTER TABLE public.contact_coverage_assignments ADD constraint contact_coverage_assignments_team_org_fk foreign key (pursuit_team_id, org_id) references pursuit_teams(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_coverage_assignments_account_org_fk' AND conrelid='public.contact_coverage_assignments'::regclass) THEN ALTER TABLE public.contact_coverage_assignments ADD constraint contact_coverage_assignments_account_org_fk foreign key (account_id, org_id) references accounts(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_coverage_assignments_contact_org_fk' AND conrelid='public.contact_coverage_assignments'::regclass) THEN ALTER TABLE public.contact_coverage_assignments ADD constraint contact_coverage_assignments_contact_org_fk foreign key (contact_id, org_id) references contacts(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_coverage_responsibilities_assignment_org_fk' AND conrelid='public.contact_coverage_responsibilities'::regclass) THEN ALTER TABLE public.contact_coverage_responsibilities ADD constraint contact_coverage_responsibilities_assignment_org_fk foreign key (contact_coverage_assignment_id, org_id) references contact_coverage_assignments(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='relationship_signals_account_org_fk' AND conrelid='public.relationship_signals'::regclass) THEN ALTER TABLE public.relationship_signals ADD constraint relationship_signals_account_org_fk foreign key (account_id, org_id) references accounts(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='relationship_signals_contact_org_fk' AND conrelid='public.relationship_signals'::regclass) THEN ALTER TABLE public.relationship_signals ADD constraint relationship_signals_contact_org_fk foreign key (contact_id, org_id) references contacts(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='relationship_signals_opportunity_org_fk' AND conrelid='public.relationship_signals'::regclass) THEN ALTER TABLE public.relationship_signals ADD constraint relationship_signals_opportunity_org_fk foreign key (opportunity_id, org_id) references opportunities(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='relationship_edges_account_org_fk' AND conrelid='public.relationship_edges'::regclass) THEN ALTER TABLE public.relationship_edges ADD constraint relationship_edges_account_org_fk foreign key (account_id, org_id) references accounts(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='relationship_edges_opportunity_org_fk' AND conrelid='public.relationship_edges'::regclass) THEN ALTER TABLE public.relationship_edges ADD constraint relationship_edges_opportunity_org_fk foreign key (opportunity_id, org_id) references opportunities(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='relationship_edges_from_contact_org_fk' AND conrelid='public.relationship_edges'::regclass) THEN ALTER TABLE public.relationship_edges ADD constraint relationship_edges_from_contact_org_fk foreign key (from_contact_id, org_id) references contacts(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='relationship_edges_to_contact_org_fk' AND conrelid='public.relationship_edges'::regclass) THEN ALTER TABLE public.relationship_edges ADD constraint relationship_edges_to_contact_org_fk foreign key (to_contact_id, org_id) references contacts(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_artifacts_account_org_fk' AND conrelid='public.pallas_artifacts'::regclass) THEN ALTER TABLE public.pallas_artifacts ADD constraint pallas_artifacts_account_org_fk foreign key (account_id, org_id) references accounts(id, org_id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_artifacts_contact_org_fk' AND conrelid='public.pallas_artifacts'::regclass) THEN ALTER TABLE public.pallas_artifacts ADD constraint pallas_artifacts_contact_org_fk foreign key (contact_id, org_id) references contacts(id, org_id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_artifacts_opportunity_org_fk' AND conrelid='public.pallas_artifacts'::regclass) THEN ALTER TABLE public.pallas_artifacts ADD constraint pallas_artifacts_opportunity_org_fk foreign key (opportunity_id, org_id) references opportunities(id, org_id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_artifacts_strategic_play_org_fk' AND conrelid='public.pallas_artifacts'::regclass) THEN ALTER TABLE public.pallas_artifacts ADD constraint pallas_artifacts_strategic_play_org_fk foreign key (strategic_play_id, org_id) references strategic_plays(id, org_id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_artifact_versions_artifact_org_fk' AND conrelid='public.pallas_artifact_versions'::regclass) THEN ALTER TABLE public.pallas_artifact_versions ADD constraint pallas_artifact_versions_artifact_org_fk foreign key (artifact_id, org_id) references pallas_artifacts(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_action_proposals_artifact_org_fk' AND conrelid='public.pallas_action_proposals'::regclass) THEN ALTER TABLE public.pallas_action_proposals ADD constraint pallas_action_proposals_artifact_org_fk foreign key (artifact_id, org_id) references pallas_artifacts(id, org_id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_action_proposals_account_org_fk' AND conrelid='public.pallas_action_proposals'::regclass) THEN ALTER TABLE public.pallas_action_proposals ADD constraint pallas_action_proposals_account_org_fk foreign key (account_id, org_id) references accounts(id, org_id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_action_proposals_contact_org_fk' AND conrelid='public.pallas_action_proposals'::regclass) THEN ALTER TABLE public.pallas_action_proposals ADD constraint pallas_action_proposals_contact_org_fk foreign key (contact_id, org_id) references contacts(id, org_id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_action_proposals_opportunity_org_fk' AND conrelid='public.pallas_action_proposals'::regclass) THEN ALTER TABLE public.pallas_action_proposals ADD constraint pallas_action_proposals_opportunity_org_fk foreign key (opportunity_id, org_id) references opportunities(id, org_id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_action_proposals_strategic_play_org_fk' AND conrelid='public.pallas_action_proposals'::regclass) THEN ALTER TABLE public.pallas_action_proposals ADD constraint pallas_action_proposals_strategic_play_org_fk foreign key (strategic_play_id, org_id) references strategic_plays(id, org_id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_tool_runs_proposal_org_fk' AND conrelid='public.pallas_tool_runs'::regclass) THEN ALTER TABLE public.pallas_tool_runs ADD constraint pallas_tool_runs_proposal_org_fk foreign key (proposal_id, org_id) references pallas_action_proposals(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='judgment_ownership_assignments_account_org_fk' AND conrelid='public.judgment_ownership_assignments'::regclass) THEN ALTER TABLE public.judgment_ownership_assignments ADD constraint judgment_ownership_assignments_account_org_fk
    foreign key (account_id, org_id) references accounts(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='judgment_ownership_assignments_opportunity_org_fk' AND conrelid='public.judgment_ownership_assignments'::regclass) THEN ALTER TABLE public.judgment_ownership_assignments ADD constraint judgment_ownership_assignments_opportunity_org_fk
    foreign key (opportunity_id, org_id) references opportunities(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='judgment_ownership_assignments_play_org_fk' AND conrelid='public.judgment_ownership_assignments'::regclass) THEN ALTER TABLE public.judgment_ownership_assignments ADD constraint judgment_ownership_assignments_play_org_fk
    foreign key (strategic_play_id, org_id) references strategic_plays(id, org_id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='teams_org_id_fkey' AND conrelid='public.teams'::regclass) THEN ALTER TABLE public.teams ADD CONSTRAINT teams_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='org_memberships_user_id_fkey' AND conrelid='public.org_memberships'::regclass) THEN ALTER TABLE public.org_memberships ADD CONSTRAINT org_memberships_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='org_memberships_org_id_fkey' AND conrelid='public.org_memberships'::regclass) THEN ALTER TABLE public.org_memberships ADD CONSTRAINT org_memberships_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='org_memberships_team_id_fkey' AND conrelid='public.org_memberships'::regclass) THEN ALTER TABLE public.org_memberships ADD CONSTRAINT org_memberships_team_id_fkey FOREIGN KEY (team_id) references teams(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='org_memberships_invited_by_fkey' AND conrelid='public.org_memberships'::regclass) THEN ALTER TABLE public.org_memberships ADD CONSTRAINT org_memberships_invited_by_fkey FOREIGN KEY (invited_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='org_memberships_reports_to_user_fkey' AND conrelid='public.org_memberships'::regclass) THEN ALTER TABLE public.org_memberships ADD CONSTRAINT org_memberships_reports_to_user_fkey FOREIGN KEY (reports_to_user) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='org_invitations_org_id_fkey' AND conrelid='public.org_invitations'::regclass) THEN ALTER TABLE public.org_invitations ADD CONSTRAINT org_invitations_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='org_invitations_invited_by_fkey' AND conrelid='public.org_invitations'::regclass) THEN ALTER TABLE public.org_invitations ADD CONSTRAINT org_invitations_invited_by_fkey FOREIGN KEY (invited_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='accounts_user_id_fkey' AND conrelid='public.accounts'::regclass) THEN ALTER TABLE public.accounts ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='accounts_org_id_fkey' AND conrelid='public.accounts'::regclass) THEN ALTER TABLE public.accounts ADD CONSTRAINT accounts_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='accounts_business_team_id_fkey' AND conrelid='public.accounts'::regclass) THEN ALTER TABLE public.accounts ADD CONSTRAINT accounts_business_team_id_fkey FOREIGN KEY (business_team_id) references teams(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='accounts_owner_id_fkey' AND conrelid='public.accounts'::regclass) THEN ALTER TABLE public.accounts ADD CONSTRAINT accounts_owner_id_fkey FOREIGN KEY (owner_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='accounts_ownership_changed_by_fkey' AND conrelid='public.accounts'::regclass) THEN ALTER TABLE public.accounts ADD CONSTRAINT accounts_ownership_changed_by_fkey FOREIGN KEY (ownership_changed_by) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contacts_user_id_fkey' AND conrelid='public.contacts'::regclass) THEN ALTER TABLE public.contacts ADD CONSTRAINT contacts_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contacts_org_id_fkey' AND conrelid='public.contacts'::regclass) THEN ALTER TABLE public.contacts ADD CONSTRAINT contacts_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contacts_account_id_fkey' AND conrelid='public.contacts'::regclass) THEN ALTER TABLE public.contacts ADD CONSTRAINT contacts_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='opportunities_user_id_fkey' AND conrelid='public.opportunities'::regclass) THEN ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='opportunities_org_id_fkey' AND conrelid='public.opportunities'::regclass) THEN ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='opportunities_account_id_fkey' AND conrelid='public.opportunities'::regclass) THEN ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='opportunities_assigned_to_fkey' AND conrelid='public.opportunities'::regclass) THEN ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_assigned_to_fkey FOREIGN KEY (assigned_to) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='intel_items_user_id_fkey' AND conrelid='public.intel_items'::regclass) THEN ALTER TABLE public.intel_items ADD CONSTRAINT intel_items_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='intel_items_org_id_fkey' AND conrelid='public.intel_items'::regclass) THEN ALTER TABLE public.intel_items ADD CONSTRAINT intel_items_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='intel_items_account_id_fkey' AND conrelid='public.intel_items'::regclass) THEN ALTER TABLE public.intel_items ADD CONSTRAINT intel_items_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='intel_items_created_by_fkey' AND conrelid='public.intel_items'::regclass) THEN ALTER TABLE public.intel_items ADD CONSTRAINT intel_items_created_by_fkey FOREIGN KEY (created_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_decodes_user_id_fkey' AND conrelid='public.email_decodes'::regclass) THEN ALTER TABLE public.email_decodes ADD CONSTRAINT email_decodes_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_decodes_org_id_fkey' AND conrelid='public.email_decodes'::regclass) THEN ALTER TABLE public.email_decodes ADD CONSTRAINT email_decodes_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_decodes_account_id_fkey' AND conrelid='public.email_decodes'::regclass) THEN ALTER TABLE public.email_decodes ADD CONSTRAINT email_decodes_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='composed_emails_user_id_fkey' AND conrelid='public.composed_emails'::regclass) THEN ALTER TABLE public.composed_emails ADD CONSTRAINT composed_emails_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='composed_emails_org_id_fkey' AND conrelid='public.composed_emails'::regclass) THEN ALTER TABLE public.composed_emails ADD CONSTRAINT composed_emails_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='composed_emails_account_id_fkey' AND conrelid='public.composed_emails'::regclass) THEN ALTER TABLE public.composed_emails ADD CONSTRAINT composed_emails_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meeting_preps_user_id_fkey' AND conrelid='public.meeting_preps'::regclass) THEN ALTER TABLE public.meeting_preps ADD CONSTRAINT meeting_preps_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meeting_preps_org_id_fkey' AND conrelid='public.meeting_preps'::regclass) THEN ALTER TABLE public.meeting_preps ADD CONSTRAINT meeting_preps_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meeting_preps_account_id_fkey' AND conrelid='public.meeting_preps'::regclass) THEN ALTER TABLE public.meeting_preps ADD CONSTRAINT meeting_preps_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='discovery_notes_user_id_fkey' AND conrelid='public.discovery_notes'::regclass) THEN ALTER TABLE public.discovery_notes ADD CONSTRAINT discovery_notes_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='discovery_notes_org_id_fkey' AND conrelid='public.discovery_notes'::regclass) THEN ALTER TABLE public.discovery_notes ADD CONSTRAINT discovery_notes_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='knowledge_items_user_id_fkey' AND conrelid='public.knowledge_items'::regclass) THEN ALTER TABLE public.knowledge_items ADD CONSTRAINT knowledge_items_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='knowledge_items_org_id_fkey' AND conrelid='public.knowledge_items'::regclass) THEN ALTER TABLE public.knowledge_items ADD CONSTRAINT knowledge_items_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_settings_user_id_fkey' AND conrelid='public.user_settings'::regclass) THEN ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_settings_org_id_fkey' AND conrelid='public.user_settings'::regclass) THEN ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_user_id_fkey' AND conrelid='public.tasks'::regclass) THEN ALTER TABLE public.tasks ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_org_id_fkey' AND conrelid='public.tasks'::regclass) THEN ALTER TABLE public.tasks ADD CONSTRAINT tasks_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_assigned_to_fkey' AND conrelid='public.tasks'::regclass) THEN ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='activity_logs_user_id_fkey' AND conrelid='public.activity_logs'::regclass) THEN ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='activity_logs_org_id_fkey' AND conrelid='public.activity_logs'::regclass) THEN ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_advices_user_id_fkey' AND conrelid='public.ai_advices'::regclass) THEN ALTER TABLE public.ai_advices ADD CONSTRAINT ai_advices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='decode_feedbacks_user_id_fkey' AND conrelid='public.decode_feedbacks'::regclass) THEN ALTER TABLE public.decode_feedbacks ADD CONSTRAINT decode_feedbacks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='knowledge_base_account_id_fkey' AND conrelid='public.knowledge_base'::regclass) THEN ALTER TABLE public.knowledge_base ADD CONSTRAINT knowledge_base_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_profiles_v2_user_id_fkey' AND conrelid='public.contact_profiles_v2'::regclass) THEN ALTER TABLE public.contact_profiles_v2 ADD CONSTRAINT contact_profiles_v2_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='outreach_logs_profile_id_fkey' AND conrelid='public.outreach_logs'::regclass) THEN ALTER TABLE public.outreach_logs ADD CONSTRAINT outreach_logs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES contact_profiles_v2(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='outreach_logs_user_id_fkey' AND conrelid='public.outreach_logs'::regclass) THEN ALTER TABLE public.outreach_logs ADD CONSTRAINT outreach_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='intel_user_id_fkey' AND conrelid='public.intel'::regclass) THEN ALTER TABLE public.intel ADD CONSTRAINT intel_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_forecasts_user_id_fkey' AND conrelid='public.ai_forecasts'::regclass) THEN ALTER TABLE public.ai_forecasts ADD CONSTRAINT ai_forecasts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='comments_org_id_fkey' AND conrelid='public.comments'::regclass) THEN ALTER TABLE public.comments ADD CONSTRAINT comments_org_id_fkey FOREIGN KEY (org_id) references public.organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='comments_user_id_fkey' AND conrelid='public.comments'::regclass) THEN ALTER TABLE public.comments ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='source_records_org_id_fkey' AND conrelid='public.source_records'::regclass) THEN ALTER TABLE public.source_records ADD CONSTRAINT source_records_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='source_records_account_id_fkey' AND conrelid='public.source_records'::regclass) THEN ALTER TABLE public.source_records ADD CONSTRAINT source_records_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='account_memory_snapshots_org_id_fkey' AND conrelid='public.account_memory_snapshots'::regclass) THEN ALTER TABLE public.account_memory_snapshots ADD CONSTRAINT account_memory_snapshots_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='account_memory_snapshots_account_id_fkey' AND conrelid='public.account_memory_snapshots'::regclass) THEN ALTER TABLE public.account_memory_snapshots ADD CONSTRAINT account_memory_snapshots_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='memory_conflicts_org_id_fkey' AND conrelid='public.memory_conflicts'::regclass) THEN ALTER TABLE public.memory_conflicts ADD CONSTRAINT memory_conflicts_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='memory_conflicts_account_id_fkey' AND conrelid='public.memory_conflicts'::regclass) THEN ALTER TABLE public.memory_conflicts ADD CONSTRAINT memory_conflicts_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='account_knowledge_pages_org_id_fkey' AND conrelid='public.account_knowledge_pages'::regclass) THEN ALTER TABLE public.account_knowledge_pages ADD CONSTRAINT account_knowledge_pages_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='account_knowledge_pages_account_id_fkey' AND conrelid='public.account_knowledge_pages'::regclass) THEN ALTER TABLE public.account_knowledge_pages ADD CONSTRAINT account_knowledge_pages_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='account_claims_org_id_fkey' AND conrelid='public.account_claims'::regclass) THEN ALTER TABLE public.account_claims ADD CONSTRAINT account_claims_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='account_claims_account_id_fkey' AND conrelid='public.account_claims'::regclass) THEN ALTER TABLE public.account_claims ADD CONSTRAINT account_claims_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='account_evidence_org_id_fkey' AND conrelid='public.account_evidence'::regclass) THEN ALTER TABLE public.account_evidence ADD CONSTRAINT account_evidence_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='account_evidence_account_id_fkey' AND conrelid='public.account_evidence'::regclass) THEN ALTER TABLE public.account_evidence ADD CONSTRAINT account_evidence_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='account_open_questions_org_id_fkey' AND conrelid='public.account_open_questions'::regclass) THEN ALTER TABLE public.account_open_questions ADD CONSTRAINT account_open_questions_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='account_open_questions_account_id_fkey' AND conrelid='public.account_open_questions'::regclass) THEN ALTER TABLE public.account_open_questions ADD CONSTRAINT account_open_questions_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='knowledge_update_log_org_id_fkey' AND conrelid='public.knowledge_update_log'::regclass) THEN ALTER TABLE public.knowledge_update_log ADD CONSTRAINT knowledge_update_log_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='knowledge_update_log_account_id_fkey' AND conrelid='public.knowledge_update_log'::regclass) THEN ALTER TABLE public.knowledge_update_log ADD CONSTRAINT knowledge_update_log_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_invocation_logs_org_id_fkey' AND conrelid='public.ai_invocation_logs'::regclass) THEN ALTER TABLE public.ai_invocation_logs ADD CONSTRAINT ai_invocation_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_invocation_logs_user_id_fkey' AND conrelid='public.ai_invocation_logs'::regclass) THEN ALTER TABLE public.ai_invocation_logs ADD CONSTRAINT ai_invocation_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='strategic_plays_org_id_fkey' AND conrelid='public.strategic_plays'::regclass) THEN ALTER TABLE public.strategic_plays ADD CONSTRAINT strategic_plays_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='strategic_plays_user_id_fkey' AND conrelid='public.strategic_plays'::regclass) THEN ALTER TABLE public.strategic_plays ADD CONSTRAINT strategic_plays_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='strategic_plays_account_id_fkey' AND conrelid='public.strategic_plays'::regclass) THEN ALTER TABLE public.strategic_plays ADD CONSTRAINT strategic_plays_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pursuit_teams_org_id_fkey' AND conrelid='public.pursuit_teams'::regclass) THEN ALTER TABLE public.pursuit_teams ADD CONSTRAINT pursuit_teams_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pursuit_teams_parent_team_id_fkey' AND conrelid='public.pursuit_teams'::regclass) THEN ALTER TABLE public.pursuit_teams ADD CONSTRAINT pursuit_teams_parent_team_id_fkey FOREIGN KEY (parent_team_id) references teams(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pursuit_teams_strategic_play_id_fkey' AND conrelid='public.pursuit_teams'::regclass) THEN ALTER TABLE public.pursuit_teams ADD CONSTRAINT pursuit_teams_strategic_play_id_fkey FOREIGN KEY (strategic_play_id) references strategic_plays(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pursuit_teams_created_by_fkey' AND conrelid='public.pursuit_teams'::regclass) THEN ALTER TABLE public.pursuit_teams ADD CONSTRAINT pursuit_teams_created_by_fkey FOREIGN KEY (created_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='responsibility_catalog_org_id_fkey' AND conrelid='public.responsibility_catalog'::regclass) THEN ALTER TABLE public.responsibility_catalog ADD CONSTRAINT responsibility_catalog_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='responsibility_catalog_created_by_fkey' AND conrelid='public.responsibility_catalog'::regclass) THEN ALTER TABLE public.responsibility_catalog ADD CONSTRAINT responsibility_catalog_created_by_fkey FOREIGN KEY (created_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pursuit_team_members_org_id_fkey' AND conrelid='public.pursuit_team_members'::regclass) THEN ALTER TABLE public.pursuit_team_members ADD CONSTRAINT pursuit_team_members_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pursuit_team_members_user_id_fkey' AND conrelid='public.pursuit_team_members'::regclass) THEN ALTER TABLE public.pursuit_team_members ADD CONSTRAINT pursuit_team_members_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pursuit_team_member_responsibilities_org_id_fkey' AND conrelid='public.pursuit_team_member_responsibilities'::regclass) THEN ALTER TABLE public.pursuit_team_member_responsibilities ADD CONSTRAINT pursuit_team_member_responsibilities_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pursuit_team_member_responsibilities_responsibility_id_fkey' AND conrelid='public.pursuit_team_member_responsibilities'::regclass) THEN ALTER TABLE public.pursuit_team_member_responsibilities ADD CONSTRAINT pursuit_team_member_responsibilities_responsibility_id_fkey FOREIGN KEY (responsibility_id) references responsibility_catalog(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_coverage_assignments_org_id_fkey' AND conrelid='public.contact_coverage_assignments'::regclass) THEN ALTER TABLE public.contact_coverage_assignments ADD CONSTRAINT contact_coverage_assignments_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_coverage_assignments_primary_user_id_fkey' AND conrelid='public.contact_coverage_assignments'::regclass) THEN ALTER TABLE public.contact_coverage_assignments ADD CONSTRAINT contact_coverage_assignments_primary_user_id_fkey FOREIGN KEY (primary_user_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_coverage_assignments_backup_user_id_fkey' AND conrelid='public.contact_coverage_assignments'::regclass) THEN ALTER TABLE public.contact_coverage_assignments ADD CONSTRAINT contact_coverage_assignments_backup_user_id_fkey FOREIGN KEY (backup_user_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_coverage_assignments_last_signal_id_fkey' AND conrelid='public.contact_coverage_assignments'::regclass) THEN ALTER TABLE public.contact_coverage_assignments ADD CONSTRAINT contact_coverage_assignments_last_signal_id_fkey FOREIGN KEY (last_signal_id) references relationship_signals(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_coverage_responsibilities_org_id_fkey' AND conrelid='public.contact_coverage_responsibilities'::regclass) THEN ALTER TABLE public.contact_coverage_responsibilities ADD CONSTRAINT contact_coverage_responsibilities_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_coverage_responsibilities_responsibility_id_fkey' AND conrelid='public.contact_coverage_responsibilities'::regclass) THEN ALTER TABLE public.contact_coverage_responsibilities ADD CONSTRAINT contact_coverage_responsibilities_responsibility_id_fkey FOREIGN KEY (responsibility_id) references responsibility_catalog(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='relationship_signals_org_id_fkey' AND conrelid='public.relationship_signals'::regclass) THEN ALTER TABLE public.relationship_signals ADD CONSTRAINT relationship_signals_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='relationship_signals_actor_user_id_fkey' AND conrelid='public.relationship_signals'::regclass) THEN ALTER TABLE public.relationship_signals ADD CONSTRAINT relationship_signals_actor_user_id_fkey FOREIGN KEY (actor_user_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='relationship_signals_source_record_id_fkey' AND conrelid='public.relationship_signals'::regclass) THEN ALTER TABLE public.relationship_signals ADD CONSTRAINT relationship_signals_source_record_id_fkey FOREIGN KEY (source_record_id) references source_records(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='relationship_edges_org_id_fkey' AND conrelid='public.relationship_edges'::regclass) THEN ALTER TABLE public.relationship_edges ADD CONSTRAINT relationship_edges_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='relationship_edges_from_user_id_fkey' AND conrelid='public.relationship_edges'::regclass) THEN ALTER TABLE public.relationship_edges ADD CONSTRAINT relationship_edges_from_user_id_fkey FOREIGN KEY (from_user_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_artifacts_org_id_fkey' AND conrelid='public.pallas_artifacts'::regclass) THEN ALTER TABLE public.pallas_artifacts ADD CONSTRAINT pallas_artifacts_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_artifacts_user_id_fkey' AND conrelid='public.pallas_artifacts'::regclass) THEN ALTER TABLE public.pallas_artifacts ADD CONSTRAINT pallas_artifacts_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_artifact_versions_org_id_fkey' AND conrelid='public.pallas_artifact_versions'::regclass) THEN ALTER TABLE public.pallas_artifact_versions ADD CONSTRAINT pallas_artifact_versions_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_artifact_versions_created_by_fkey' AND conrelid='public.pallas_artifact_versions'::regclass) THEN ALTER TABLE public.pallas_artifact_versions ADD CONSTRAINT pallas_artifact_versions_created_by_fkey FOREIGN KEY (created_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_action_proposals_org_id_fkey' AND conrelid='public.pallas_action_proposals'::regclass) THEN ALTER TABLE public.pallas_action_proposals ADD CONSTRAINT pallas_action_proposals_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_action_proposals_user_id_fkey' AND conrelid='public.pallas_action_proposals'::regclass) THEN ALTER TABLE public.pallas_action_proposals ADD CONSTRAINT pallas_action_proposals_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_action_proposals_confirmed_by_fkey' AND conrelid='public.pallas_action_proposals'::regclass) THEN ALTER TABLE public.pallas_action_proposals ADD CONSTRAINT pallas_action_proposals_confirmed_by_fkey FOREIGN KEY (confirmed_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pallas_tool_runs_org_id_fkey' AND conrelid='public.pallas_tool_runs'::regclass) THEN ALTER TABLE public.pallas_tool_runs ADD CONSTRAINT pallas_tool_runs_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='judgment_ownership_assignments_org_id_fkey' AND conrelid='public.judgment_ownership_assignments'::regclass) THEN ALTER TABLE public.judgment_ownership_assignments ADD CONSTRAINT judgment_ownership_assignments_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='judgment_ownership_assignments_assigned_user_id_fkey' AND conrelid='public.judgment_ownership_assignments'::regclass) THEN ALTER TABLE public.judgment_ownership_assignments ADD CONSTRAINT judgment_ownership_assignments_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) references auth.users(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='judgment_ownership_assignments_assigned_by_fkey' AND conrelid='public.judgment_ownership_assignments'::regclass) THEN ALTER TABLE public.judgment_ownership_assignments ADD CONSTRAINT judgment_ownership_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_org_id_fkey' AND conrelid='public.leads'::regclass) THEN ALTER TABLE public.leads ADD CONSTRAINT leads_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_user_id_fkey' AND conrelid='public.leads'::regclass) THEN ALTER TABLE public.leads ADD CONSTRAINT leads_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_owner_id_fkey' AND conrelid='public.leads'::regclass) THEN ALTER TABLE public.leads ADD CONSTRAINT leads_owner_id_fkey FOREIGN KEY (owner_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_converted_account_id_fkey' AND conrelid='public.leads'::regclass) THEN ALTER TABLE public.leads ADD CONSTRAINT leads_converted_account_id_fkey FOREIGN KEY (converted_account_id) references accounts(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_converted_contact_id_fkey' AND conrelid='public.leads'::regclass) THEN ALTER TABLE public.leads ADD CONSTRAINT leads_converted_contact_id_fkey FOREIGN KEY (converted_contact_id) references contacts(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_converted_opportunity_id_fkey' AND conrelid='public.leads'::regclass) THEN ALTER TABLE public.leads ADD CONSTRAINT leads_converted_opportunity_id_fkey FOREIGN KEY (converted_opportunity_id) references opportunities(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_opportunity_roles_org_id_fkey' AND conrelid='public.contact_opportunity_roles'::regclass) THEN ALTER TABLE public.contact_opportunity_roles ADD CONSTRAINT contact_opportunity_roles_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_opportunity_roles_contact_id_fkey' AND conrelid='public.contact_opportunity_roles'::regclass) THEN ALTER TABLE public.contact_opportunity_roles ADD CONSTRAINT contact_opportunity_roles_contact_id_fkey FOREIGN KEY (contact_id) references contacts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_opportunity_roles_opportunity_id_fkey' AND conrelid='public.contact_opportunity_roles'::regclass) THEN ALTER TABLE public.contact_opportunity_roles ADD CONSTRAINT contact_opportunity_roles_opportunity_id_fkey FOREIGN KEY (opportunity_id) references opportunities(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_opportunity_roles_relationship_owner_id_fkey' AND conrelid='public.contact_opportunity_roles'::regclass) THEN ALTER TABLE public.contact_opportunity_roles ADD CONSTRAINT contact_opportunity_roles_relationship_owner_id_fkey FOREIGN KEY (relationship_owner_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_opportunity_roles_created_by_fkey' AND conrelid='public.contact_opportunity_roles'::regclass) THEN ALTER TABLE public.contact_opportunity_roles ADD CONSTRAINT contact_opportunity_roles_created_by_fkey FOREIGN KEY (created_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_opportunity_roles_updated_by_fkey' AND conrelid='public.contact_opportunity_roles'::regclass) THEN ALTER TABLE public.contact_opportunity_roles ADD CONSTRAINT contact_opportunity_roles_updated_by_fkey FOREIGN KEY (updated_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='timeline_events_org_id_fkey' AND conrelid='public.timeline_events'::regclass) THEN ALTER TABLE public.timeline_events ADD CONSTRAINT timeline_events_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='timeline_events_user_id_fkey' AND conrelid='public.timeline_events'::regclass) THEN ALTER TABLE public.timeline_events ADD CONSTRAINT timeline_events_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='timeline_events_account_id_fkey' AND conrelid='public.timeline_events'::regclass) THEN ALTER TABLE public.timeline_events ADD CONSTRAINT timeline_events_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='timeline_events_opportunity_id_fkey' AND conrelid='public.timeline_events'::regclass) THEN ALTER TABLE public.timeline_events ADD CONSTRAINT timeline_events_opportunity_id_fkey FOREIGN KEY (opportunity_id) references opportunities(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='timeline_events_contact_id_fkey' AND conrelid='public.timeline_events'::regclass) THEN ALTER TABLE public.timeline_events ADD CONSTRAINT timeline_events_contact_id_fkey FOREIGN KEY (contact_id) references contacts(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='timeline_event_links_org_id_fkey' AND conrelid='public.timeline_event_links'::regclass) THEN ALTER TABLE public.timeline_event_links ADD CONSTRAINT timeline_event_links_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='timeline_event_links_event_id_fkey' AND conrelid='public.timeline_event_links'::regclass) THEN ALTER TABLE public.timeline_event_links ADD CONSTRAINT timeline_event_links_event_id_fkey FOREIGN KEY (event_id) references timeline_events(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='opportunity_stage_history_org_id_fkey' AND conrelid='public.opportunity_stage_history'::regclass) THEN ALTER TABLE public.opportunity_stage_history ADD CONSTRAINT opportunity_stage_history_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='opportunity_stage_history_opportunity_id_fkey' AND conrelid='public.opportunity_stage_history'::regclass) THEN ALTER TABLE public.opportunity_stage_history ADD CONSTRAINT opportunity_stage_history_opportunity_id_fkey FOREIGN KEY (opportunity_id) references opportunities(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='opportunity_stage_history_changed_by_fkey' AND conrelid='public.opportunity_stage_history'::regclass) THEN ALTER TABLE public.opportunity_stage_history ADD CONSTRAINT opportunity_stage_history_changed_by_fkey FOREIGN KEY (changed_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='opportunity_close_date_history_org_id_fkey' AND conrelid='public.opportunity_close_date_history'::regclass) THEN ALTER TABLE public.opportunity_close_date_history ADD CONSTRAINT opportunity_close_date_history_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='opportunity_close_date_history_opportunity_id_fkey' AND conrelid='public.opportunity_close_date_history'::regclass) THEN ALTER TABLE public.opportunity_close_date_history ADD CONSTRAINT opportunity_close_date_history_opportunity_id_fkey FOREIGN KEY (opportunity_id) references opportunities(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='opportunity_close_date_history_changed_by_fkey' AND conrelid='public.opportunity_close_date_history'::regclass) THEN ALTER TABLE public.opportunity_close_date_history ADD CONSTRAINT opportunity_close_date_history_changed_by_fkey FOREIGN KEY (changed_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_insights_org_id_fkey' AND conrelid='public.ai_insights'::regclass) THEN ALTER TABLE public.ai_insights ADD CONSTRAINT ai_insights_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_events_org_id_fkey' AND conrelid='public.ai_events'::regclass) THEN ALTER TABLE public.ai_events ADD CONSTRAINT ai_events_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_events_user_id_fkey' AND conrelid='public.ai_events'::regclass) THEN ALTER TABLE public.ai_events ADD CONSTRAINT ai_events_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='channel_partners_org_id_fkey' AND conrelid='public.channel_partners'::regclass) THEN ALTER TABLE public.channel_partners ADD CONSTRAINT channel_partners_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='channel_partners_user_id_fkey' AND conrelid='public.channel_partners'::regclass) THEN ALTER TABLE public.channel_partners ADD CONSTRAINT channel_partners_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deal_registrations_org_id_fkey' AND conrelid='public.deal_registrations'::regclass) THEN ALTER TABLE public.deal_registrations ADD CONSTRAINT deal_registrations_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deal_registrations_user_id_fkey' AND conrelid='public.deal_registrations'::regclass) THEN ALTER TABLE public.deal_registrations ADD CONSTRAINT deal_registrations_user_id_fkey FOREIGN KEY (user_id) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deal_registrations_partner_id_fkey' AND conrelid='public.deal_registrations'::regclass) THEN ALTER TABLE public.deal_registrations ADD CONSTRAINT deal_registrations_partner_id_fkey FOREIGN KEY (partner_id) references channel_partners(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotas_org_id_fkey' AND conrelid='public.quotas'::regclass) THEN ALTER TABLE public.quotas ADD CONSTRAINT quotas_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotas_user_id_fkey' AND conrelid='public.quotas'::regclass) THEN ALTER TABLE public.quotas ADD CONSTRAINT quotas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotas_team_id_fkey' AND conrelid='public.quotas'::regclass) THEN ALTER TABLE public.quotas ADD CONSTRAINT quotas_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotas_created_by_fkey' AND conrelid='public.quotas'::regclass) THEN ALTER TABLE public.quotas ADD CONSTRAINT quotas_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='forecasts_org_id_fkey' AND conrelid='public.forecasts'::regclass) THEN ALTER TABLE public.forecasts ADD CONSTRAINT forecasts_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='forecasts_user_id_fkey' AND conrelid='public.forecasts'::regclass) THEN ALTER TABLE public.forecasts ADD CONSTRAINT forecasts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='org_wide_defaults_org_id_fkey' AND conrelid='public.org_wide_defaults'::regclass) THEN ALTER TABLE public.org_wide_defaults ADD CONSTRAINT org_wide_defaults_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='record_shares_org_id_fkey' AND conrelid='public.record_shares'::regclass) THEN ALTER TABLE public.record_shares ADD CONSTRAINT record_shares_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='record_shares_shared_by_fkey' AND conrelid='public.record_shares'::regclass) THEN ALTER TABLE public.record_shares ADD CONSTRAINT record_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES auth.users(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ownership_transfers_org_id_fkey' AND conrelid='public.ownership_transfers'::regclass) THEN ALTER TABLE public.ownership_transfers ADD CONSTRAINT ownership_transfers_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ownership_transfers_from_user_fkey' AND conrelid='public.ownership_transfers'::regclass) THEN ALTER TABLE public.ownership_transfers ADD CONSTRAINT ownership_transfers_from_user_fkey FOREIGN KEY (from_user) REFERENCES auth.users(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ownership_transfers_to_user_fkey' AND conrelid='public.ownership_transfers'::regclass) THEN ALTER TABLE public.ownership_transfers ADD CONSTRAINT ownership_transfers_to_user_fkey FOREIGN KEY (to_user) REFERENCES auth.users(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ownership_transfers_transferred_by_fkey' AND conrelid='public.ownership_transfers'::regclass) THEN ALTER TABLE public.ownership_transfers ADD CONSTRAINT ownership_transfers_transferred_by_fkey FOREIGN KEY (transferred_by) REFERENCES auth.users(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pool_rules_org_id_fkey' AND conrelid='public.pool_rules'::regclass) THEN ALTER TABLE public.pool_rules ADD CONSTRAINT pool_rules_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='audit_log_org_id_fkey' AND conrelid='public.audit_log'::regclass) THEN ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='audit_log_user_id_fkey' AND conrelid='public.audit_log'::regclass) THEN ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='integration_tokens_connection_id_fkey' AND conrelid='public.integration_tokens'::regclass) THEN ALTER TABLE public.integration_tokens ADD CONSTRAINT integration_tokens_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='integration_sync_state_connection_id_fkey' AND conrelid='public.integration_sync_state'::regclass) THEN ALTER TABLE public.integration_sync_state ADD CONSTRAINT integration_sync_state_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='integration_emails_connection_id_fkey' AND conrelid='public.integration_emails'::regclass) THEN ALTER TABLE public.integration_emails ADD CONSTRAINT integration_emails_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_org_id_fkey' AND conrelid='public.products'::regclass) THEN ALTER TABLE public.products ADD CONSTRAINT products_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotes_org_id_fkey' AND conrelid='public.quotes'::regclass) THEN ALTER TABLE public.quotes ADD CONSTRAINT quotes_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotes_opportunity_id_fkey' AND conrelid='public.quotes'::regclass) THEN ALTER TABLE public.quotes ADD CONSTRAINT quotes_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotes_account_id_fkey' AND conrelid='public.quotes'::regclass) THEN ALTER TABLE public.quotes ADD CONSTRAINT quotes_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotes_created_by_fkey' AND conrelid='public.quotes'::regclass) THEN ALTER TABLE public.quotes ADD CONSTRAINT quotes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quote_items_quote_id_fkey' AND conrelid='public.quote_items'::regclass) THEN ALTER TABLE public.quote_items ADD CONSTRAINT quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quote_items_product_id_fkey' AND conrelid='public.quote_items'::regclass) THEN ALTER TABLE public.quote_items ADD CONSTRAINT quote_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='integration_wecom_contacts_connection_id_fkey' AND conrelid='public.integration_wecom_contacts'::regclass) THEN ALTER TABLE public.integration_wecom_contacts ADD CONSTRAINT integration_wecom_contacts_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='integration_wecom_groups_connection_id_fkey' AND conrelid='public.integration_wecom_groups'::regclass) THEN ALTER TABLE public.integration_wecom_groups ADD CONSTRAINT integration_wecom_groups_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='opportunity_contacts_org_id_fkey' AND conrelid='public.opportunity_contacts'::regclass) THEN ALTER TABLE public.opportunity_contacts ADD CONSTRAINT opportunity_contacts_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_enrichment_log_org_id_fkey' AND conrelid='public.contact_enrichment_log'::regclass) THEN ALTER TABLE public.contact_enrichment_log ADD CONSTRAINT contact_enrichment_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfps_org_id_fkey' AND conrelid='public.rfps'::regclass) THEN ALTER TABLE public.rfps ADD CONSTRAINT rfps_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfps_account_id_fkey' AND conrelid='public.rfps'::regclass) THEN ALTER TABLE public.rfps ADD CONSTRAINT rfps_account_id_fkey FOREIGN KEY (account_id) references accounts(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfps_linked_play_id_fkey' AND conrelid='public.rfps'::regclass) THEN ALTER TABLE public.rfps ADD CONSTRAINT rfps_linked_play_id_fkey FOREIGN KEY (linked_play_id) references strategic_plays(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfps_created_by_fkey' AND conrelid='public.rfps'::regclass) THEN ALTER TABLE public.rfps ADD CONSTRAINT rfps_created_by_fkey FOREIGN KEY (created_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfp_documents_org_id_fkey' AND conrelid='public.rfp_documents'::regclass) THEN ALTER TABLE public.rfp_documents ADD CONSTRAINT rfp_documents_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfp_documents_rfp_id_fkey' AND conrelid='public.rfp_documents'::regclass) THEN ALTER TABLE public.rfp_documents ADD CONSTRAINT rfp_documents_rfp_id_fkey FOREIGN KEY (rfp_id) references rfps(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfp_documents_uploaded_by_fkey' AND conrelid='public.rfp_documents'::regclass) THEN ALTER TABLE public.rfp_documents ADD CONSTRAINT rfp_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfp_milestones_org_id_fkey' AND conrelid='public.rfp_milestones'::regclass) THEN ALTER TABLE public.rfp_milestones ADD CONSTRAINT rfp_milestones_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfp_milestones_rfp_id_fkey' AND conrelid='public.rfp_milestones'::regclass) THEN ALTER TABLE public.rfp_milestones ADD CONSTRAINT rfp_milestones_rfp_id_fkey FOREIGN KEY (rfp_id) references rfps(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfp_milestones_assigned_to_fkey' AND conrelid='public.rfp_milestones'::regclass) THEN ALTER TABLE public.rfp_milestones ADD CONSTRAINT rfp_milestones_assigned_to_fkey FOREIGN KEY (assigned_to) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfp_competitors_org_id_fkey' AND conrelid='public.rfp_competitors'::regclass) THEN ALTER TABLE public.rfp_competitors ADD CONSTRAINT rfp_competitors_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfp_competitors_rfp_id_fkey' AND conrelid='public.rfp_competitors'::regclass) THEN ALTER TABLE public.rfp_competitors ADD CONSTRAINT rfp_competitors_rfp_id_fkey FOREIGN KEY (rfp_id) references rfps(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfp_ai_analyses_org_id_fkey' AND conrelid='public.rfp_ai_analyses'::regclass) THEN ALTER TABLE public.rfp_ai_analyses ADD CONSTRAINT rfp_ai_analyses_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rfp_ai_analyses_rfp_id_fkey' AND conrelid='public.rfp_ai_analyses'::regclass) THEN ALTER TABLE public.rfp_ai_analyses ADD CONSTRAINT rfp_ai_analyses_rfp_id_fkey FOREIGN KEY (rfp_id) references rfps(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='org_dashboard_configs_org_id_fkey' AND conrelid='public.org_dashboard_configs'::regclass) THEN ALTER TABLE public.org_dashboard_configs ADD CONSTRAINT org_dashboard_configs_org_id_fkey FOREIGN KEY (org_id) references organizations(id) on delete cascade; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='org_dashboard_configs_updated_by_fkey' AND conrelid='public.org_dashboard_configs'::regclass) THEN ALTER TABLE public.org_dashboard_configs ADD CONSTRAINT org_dashboard_configs_updated_by_fkey FOREIGN KEY (updated_by) references auth.users(id) on delete set null; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='import_jobs_org_id_fkey' AND conrelid='public.import_jobs'::regclass) THEN ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='import_jobs_user_id_fkey' AND conrelid='public.import_jobs'::regclass) THEN ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='import_rows_org_id_fkey' AND conrelid='public.import_rows'::regclass) THEN ALTER TABLE public.import_rows ADD CONSTRAINT import_rows_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='import_rows_import_job_id_fkey' AND conrelid='public.import_rows'::regclass) THEN ALTER TABLE public.import_rows ADD CONSTRAINT import_rows_import_job_id_fkey FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='field_mappings_org_id_fkey' AND conrelid='public.field_mappings'::regclass) THEN ALTER TABLE public.field_mappings ADD CONSTRAINT field_mappings_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='field_mappings_import_job_id_fkey' AND conrelid='public.field_mappings'::regclass) THEN ALTER TABLE public.field_mappings ADD CONSTRAINT field_mappings_import_job_id_fkey FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='duplicate_candidates_org_id_fkey' AND conrelid='public.duplicate_candidates'::regclass) THEN ALTER TABLE public.duplicate_candidates ADD CONSTRAINT duplicate_candidates_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='duplicate_candidates_import_job_id_fkey' AND conrelid='public.duplicate_candidates'::regclass) THEN ALTER TABLE public.duplicate_candidates ADD CONSTRAINT duplicate_candidates_import_job_id_fkey FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='merge_decisions_org_id_fkey' AND conrelid='public.merge_decisions'::regclass) THEN ALTER TABLE public.merge_decisions ADD CONSTRAINT merge_decisions_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='merge_decisions_import_job_id_fkey' AND conrelid='public.merge_decisions'::regclass) THEN ALTER TABLE public.merge_decisions ADD CONSTRAINT merge_decisions_import_job_id_fkey FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='merge_decisions_decided_by_fkey' AND conrelid='public.merge_decisions'::regclass) THEN ALTER TABLE public.merge_decisions ADD CONSTRAINT merge_decisions_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='data_quality_findings_org_id_fkey' AND conrelid='public.data_quality_findings'::regclass) THEN ALTER TABLE public.data_quality_findings ADD CONSTRAINT data_quality_findings_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='data_quality_findings_import_job_id_fkey' AND conrelid='public.data_quality_findings'::regclass) THEN ALTER TABLE public.data_quality_findings ADD CONSTRAINT data_quality_findings_import_job_id_fkey FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='data_quality_findings_created_by_fkey' AND conrelid='public.data_quality_findings'::regclass) THEN ALTER TABLE public.data_quality_findings ADD CONSTRAINT data_quality_findings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='data_quality_findings_resolved_by_fkey' AND conrelid='public.data_quality_findings'::regclass) THEN ALTER TABLE public.data_quality_findings ADD CONSTRAINT data_quality_findings_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='engine_evidence_refs_source_record_id_fkey' AND conrelid='public.engine_evidence_refs'::regclass) THEN ALTER TABLE public.engine_evidence_refs ADD CONSTRAINT engine_evidence_refs_source_record_id_fkey FOREIGN KEY (source_record_id) REFERENCES engine_source_records(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='engine_moves_win_gap_id_fkey' AND conrelid='public.engine_moves'::regclass) THEN ALTER TABLE public.engine_moves ADD CONSTRAINT engine_moves_win_gap_id_fkey FOREIGN KEY (win_gap_id) REFERENCES engine_win_gaps(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='play_relationships_org_id_fkey' AND conrelid='public.play_relationships'::regclass) THEN ALTER TABLE public.play_relationships ADD CONSTRAINT play_relationships_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='play_relationships_source_play_id_fkey' AND conrelid='public.play_relationships'::regclass) THEN ALTER TABLE public.play_relationships ADD CONSTRAINT play_relationships_source_play_id_fkey FOREIGN KEY (source_play_id) REFERENCES strategic_plays(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='play_relationships_target_play_id_fkey' AND conrelid='public.play_relationships'::regclass) THEN ALTER TABLE public.play_relationships ADD CONSTRAINT play_relationships_target_play_id_fkey FOREIGN KEY (target_play_id) REFERENCES strategic_plays(id) ON DELETE CASCADE; END IF; END $$;
