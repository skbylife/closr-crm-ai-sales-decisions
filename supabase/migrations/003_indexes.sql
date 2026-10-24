-- 003_indexes.sql
-- All indexes for foreign keys, org_id tenant isolation, and user_id lookups.
-- Idempotent: safe to re-run.

-- Foreign key indexes
create index if not exists idx_contacts_account_id on contacts(account_id);
create index if not exists idx_opportunities_account_id on opportunities(account_id);
create index if not exists idx_intel_items_account_id on intel_items(account_id);
create index if not exists idx_email_decodes_account_id on email_decodes(account_id);
create index if not exists idx_composed_emails_account_id on composed_emails(account_id);
create index if not exists idx_meeting_preps_account_id on meeting_preps(account_id);
create index if not exists idx_discovery_notes_opportunity_id on discovery_notes(opportunity_id);

-- org_id indexes for tenant isolation
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

-- user_id indexes (backward compat and user-level queries)
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

-- Organization table indexes
create index if not exists idx_teams_org_id on teams(org_id);
create index if not exists idx_org_memberships_user_id on org_memberships(user_id);
create index if not exists idx_org_memberships_org_id on org_memberships(org_id);
create index if not exists idx_org_invitations_org_id on org_invitations(org_id);
create index if not exists idx_org_invitations_token on org_invitations(token);
create index if not exists idx_org_invitations_email on org_invitations(email);
