-- ═══════════════════════════════════════════════════════════════════════
-- Migration 014: Compiled Intelligence Layer (CIL) Phase 1 — Data Model Foundation
-- ═══════════════════════════════════════════════════════════════════════
-- Additive schema only. Does NOT modify any existing tables.
-- Creates the storage foundation for account-level compiled knowledge objects.

-- ─── 1. account_knowledge_pages ────────────────────────────────────────
-- Persistent, versioned knowledge pages per account (overview, stakeholders, risks, etc.)

create table if not exists account_knowledge_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  account_id text references accounts(id) on delete cascade not null,
  page_type text not null,           -- overview | stakeholders | initiatives | risks | timeline | open_questions
  title text not null default '',
  content_json jsonb not null default '{}',
  content_md text,                   -- optional markdown for rendering
  version integer not null default 1,
  updated_by text not null default 'system',  -- system | user | ai
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(org_id, account_id, page_type)
);

create index if not exists idx_account_knowledge_pages_org_account
  on account_knowledge_pages(org_id, account_id);
create index if not exists idx_account_knowledge_pages_type
  on account_knowledge_pages(org_id, page_type);

alter table account_knowledge_pages enable row level security;

drop policy if exists "account_knowledge_pages_rls" on account_knowledge_pages;
create policy "account_knowledge_pages_rls" on account_knowledge_pages for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));


-- ─── 2. account_claims ─────────────────────────────────────────────────
-- Explicit judgments / hypotheses with evidence support and confidence.

create table if not exists account_claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  account_id text references accounts(id) on delete cascade not null,
  claim_type text not null,          -- stakeholder_assessment | risk_hypothesis | initiative_judgment | budget_signal | procurement_signal | general
  statement text not null,
  status text not null default 'active',  -- active | stale | archived | invalidated
  confidence numeric(5,2) default 0.5,
  supporting_evidence_ids jsonb not null default '[]',
  counter_evidence_ids jsonb not null default '[]',
  affected_object_ids jsonb not null default '[]',
  last_revalidated_at timestamptz default now(),
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_account_claims_org_account
  on account_claims(org_id, account_id);
create index if not exists idx_account_claims_status
  on account_claims(org_id, status) where status = 'active';
create index if not exists idx_account_claims_type
  on account_claims(org_id, claim_type);

alter table account_claims enable row level security;

drop policy if exists "account_claims_rls" on account_claims;
create policy "account_claims_rls" on account_claims for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));


-- ─── 3. account_evidence ───────────────────────────────────────────────
-- Structured evidence ledger linking raw sources to claims and knowledge pages.

create table if not exists account_evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  account_id text references accounts(id) on delete cascade not null,
  source_id text not null,           -- FK-like ref to the raw source record
  source_type text not null,         -- call_transcript | email | meeting_note | news | crm_event | note | upload
  evidence_type text not null,       -- commitment | objection | budget_signal | procurement_signal | champion_signal | risk_signal | initiative_signal | general
  quote_text text,                   -- verbatim excerpt from source
  summary text,                      -- AI-generated summary of this evidence
  speaker text,                      -- who said / wrote it
  occurred_at timestamptz,
  relevance_score numeric(5,2) default 0.5,
  linked_claim_ids jsonb not null default '[]',
  linked_page_types jsonb not null default '[]',
  metadata jsonb not null default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_account_evidence_org_account
  on account_evidence(org_id, account_id, occurred_at desc);
create index if not exists idx_account_evidence_source
  on account_evidence(org_id, source_id);
create index if not exists idx_account_evidence_type
  on account_evidence(org_id, evidence_type);

alter table account_evidence enable row level security;

drop policy if exists "account_evidence_rls" on account_evidence;
create policy "account_evidence_rls" on account_evidence for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));


-- ─── 4. account_open_questions ─────────────────────────────────────────
-- Explicit tracking of unknowns and knowledge gaps that block downstream reasoning.

create table if not exists account_open_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  account_id text references accounts(id) on delete cascade not null,
  question text not null,
  priority text not null default 'medium',  -- high | medium | low
  status text not null default 'open',      -- open | answered | dismissed
  related_objects jsonb not null default '[]',
  blocking_outputs jsonb not null default '[]',
  answer text,                       -- filled when resolved
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  resolved_at timestamptz
);

create index if not exists idx_account_open_questions_org_account
  on account_open_questions(org_id, account_id);
create index if not exists idx_account_open_questions_status
  on account_open_questions(org_id, status) where status = 'open';

alter table account_open_questions enable row level security;

drop policy if exists "account_open_questions_rls" on account_open_questions;
create policy "account_open_questions_rls" on account_open_questions for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));


-- ─── 5. knowledge_update_log (minimal) ─────────────────────────────────
-- Audit trail for CIL updates. Useful for explainability and debugging.

create table if not exists knowledge_update_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  account_id text references accounts(id) on delete cascade not null,
  trigger_source_id text,            -- what raw source triggered this update
  update_type text not null default 'ingest',  -- ingest | refresh | lint | manual
  changed_pages jsonb not null default '[]',
  changed_claims jsonb not null default '[]',
  summary text,
  created_at timestamptz default now()
);

create index if not exists idx_knowledge_update_log_org_account
  on knowledge_update_log(org_id, account_id, created_at desc);

alter table knowledge_update_log enable row level security;

drop policy if exists "knowledge_update_log_rls" on knowledge_update_log;
create policy "knowledge_update_log_rls" on knowledge_update_log for all
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
