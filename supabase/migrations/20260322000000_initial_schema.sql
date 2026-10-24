-- Closr Database Schema (text IDs - compatible with app's uid() generator)
-- No RLS for now (demo mode).

-- 1. Accounts
create table if not exists accounts (
  id text primary key,
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
  created_at timestamptz default now(),
  updated_at timestamptz,
  last_contacted_at timestamptz
);

-- 3. Opportunities
create table if not exists opportunities (
  id text primary key,
  account_id text references accounts(id) on delete cascade,
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
  champion_contact_ids text[] default '{}',
  economic_buyer_contact_id text,
  competitor_ids text[] default '{}',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. Intel Items
create table if not exists intel_items (
  id text primary key,
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
  opportunity_id text,
  created_at timestamptz default now()
);

-- 5. Email Decodes
create table if not exists email_decodes (
  id text primary key,
  account_id text references accounts(id) on delete set null,
  account_name text,
  opportunity_id text,
  email_text text,
  client_name text,
  deal_stage text,
  decode jsonb,
  strategy jsonb,
  date text,
  created_at timestamptz default now()
);

-- 6. Composed Emails
create table if not exists composed_emails (
  id text primary key,
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
  account_id text references accounts(id) on delete cascade,
  input jsonb,
  result jsonb,
  created_at timestamptz default now()
);

-- 8. Discovery Notes
create table if not exists discovery_notes (
  id text primary key,
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
  title text not null,
  content text,
  category text,
  file_size integer,
  created_at timestamptz default now()
);

-- 10. User Settings
create table if not exists user_settings (
  id text primary key,
  user_name text,
  role text,
  role_level text,
  gemini_key text,
  targets jsonb,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_contacts_account_id on contacts(account_id);
create index if not exists idx_opportunities_account_id on opportunities(account_id);
create index if not exists idx_intel_items_account_id on intel_items(account_id);
create index if not exists idx_email_decodes_account_id on email_decodes(account_id);
create index if not exists idx_composed_emails_account_id on composed_emails(account_id);
create index if not exists idx_meeting_preps_account_id on meeting_preps(account_id);
create index if not exists idx_discovery_notes_opportunity_id on discovery_notes(opportunity_id);
