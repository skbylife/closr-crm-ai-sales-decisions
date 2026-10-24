-- Index declarations retained from application migrations.
-- supabase/migrations/003_indexes.sql
create index if not exists idx_contacts_account_id on contacts(account_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_opportunities_account_id on opportunities(account_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_intel_items_account_id on intel_items(account_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_email_decodes_account_id on email_decodes(account_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_composed_emails_account_id on composed_emails(account_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_meeting_preps_account_id on meeting_preps(account_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_discovery_notes_opportunity_id on discovery_notes(opportunity_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_accounts_org_id on accounts(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_contacts_org_id on contacts(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_opportunities_org_id on opportunities(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_intel_items_org_id on intel_items(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_email_decodes_org_id on email_decodes(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_composed_emails_org_id on composed_emails(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_meeting_preps_org_id on meeting_preps(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_discovery_notes_org_id on discovery_notes(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_knowledge_items_org_id on knowledge_items(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_user_settings_org_id on user_settings(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_tasks_org_id on tasks(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_accounts_user_id on accounts(user_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_contacts_user_id on contacts(user_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_opportunities_user_id on opportunities(user_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_intel_items_user_id on intel_items(user_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_email_decodes_user_id on email_decodes(user_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_composed_emails_user_id on composed_emails(user_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_meeting_preps_user_id on meeting_preps(user_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_discovery_notes_user_id on discovery_notes(user_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_knowledge_items_user_id on knowledge_items(user_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_user_settings_user_id on user_settings(user_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_tasks_user_id on tasks(user_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_teams_org_id on teams(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_org_memberships_user_id on org_memberships(user_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_org_memberships_org_id on org_memberships(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_org_invitations_org_id on org_invitations(org_id);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_org_invitations_token on org_invitations(token);

-- supabase/migrations/003_indexes.sql
create index if not exists idx_org_invitations_email on org_invitations(email);

-- supabase/migrations/005_activity_logs.sql
create index if not exists idx_activity_logs_org_id on activity_logs(org_id);

-- supabase/migrations/005_activity_logs.sql
create index if not exists idx_activity_logs_user_id on activity_logs(user_id);

-- supabase/migrations/005_activity_logs.sql
create index if not exists idx_activity_logs_created_at on activity_logs(created_at desc);

-- supabase/migrations/005_activity_logs.sql
create index if not exists idx_activity_logs_account_id on activity_logs(account_id);

-- supabase/migrations/20260402000000_account_knowledge_base.sql
CREATE INDEX IF NOT EXISTS idx_knowledge_base_account ON knowledge_base(account_id);

-- supabase/migrations/20260402000000_account_knowledge_base.sql
CREATE INDEX IF NOT EXISTS idx_knowledge_base_org ON knowledge_base(org_id);

-- supabase/migrations/20260402000000_account_knowledge_base.sql
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category);

-- supabase/migrations/20260402000000_account_knowledge_base.sql
CREATE INDEX IF NOT EXISTS idx_knowledge_base_title ON knowledge_base USING gin(to_tsvector('simple', title));

-- supabase/migrations/20260402000000_account_knowledge_base.sql
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content ON knowledge_base USING gin(to_tsvector('simple', content));

-- supabase/migrations/20260402100000_knowledge_embeddings.sql
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding
  ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- supabase/migrations/20260402220000_add_contact_profiles_vector.sql
CREATE INDEX IF NOT EXISTS contact_profiles_v2_user_idx ON contact_profiles_v2(user_id);

-- supabase/migrations/20260402220000_add_contact_profiles_vector.sql
CREATE INDEX IF NOT EXISTS contact_profiles_v2_embedding_idx ON contact_profiles_v2 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- supabase/migrations/20260402220000_add_contact_profiles_vector.sql
CREATE INDEX IF NOT EXISTS strategy_cases_embedding_idx ON strategy_cases
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- supabase/migrations/20260402220000_add_contact_profiles_vector.sql
CREATE INDEX IF NOT EXISTS outreach_logs_profile_idx ON outreach_logs(profile_id);

-- supabase/migrations/20260403080000_extend_intel_signals.sql
CREATE INDEX IF NOT EXISTS idx_intel_user_priority
  ON intel (user_id, priority, created_at DESC);

-- supabase/migrations/20260403080000_extend_intel_signals.sql
CREATE INDEX IF NOT EXISTS idx_intel_contact_created
  ON intel (contact_id, created_at DESC);

-- supabase/migrations/20260404000000_update_user_settings_schema.sql
create unique index if not exists user_settings_user_id_key on user_settings(user_id);

-- supabase/migrations/20260404000100_ai_forecasts.sql
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_opp
  ON ai_forecasts(opportunity_id, created_at DESC);

-- supabase/migrations/20260404000200_ai_advices_daily.sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_advices_opp_date
  ON ai_advices (opportunity_id, generated_at)
  WHERE opportunity_id IS NOT NULL AND generated_at IS NOT NULL;

-- supabase/migrations/20260404000400_missing_indexes.sql
CREATE INDEX IF NOT EXISTS idx_email_decodes_matched_contact_id ON email_decodes(matched_contact_id);

-- supabase/migrations/20260404000400_missing_indexes.sql
CREATE INDEX IF NOT EXISTS idx_ai_advices_org_id ON ai_advices(org_id);

-- supabase/migrations/20260404000400_missing_indexes.sql
CREATE INDEX IF NOT EXISTS idx_ai_advices_user_id ON ai_advices(user_id);

-- supabase/migrations/20260404000400_missing_indexes.sql
CREATE INDEX IF NOT EXISTS idx_strategic_plays_opportunity_id ON strategic_plays(opportunity_id);

-- supabase/migrations/20260404000400_missing_indexes.sql
CREATE INDEX IF NOT EXISTS idx_strategic_plays_user_id ON strategic_plays(user_id);

-- supabase/migrations/20260404001000_add_comments_table.sql
create index if not exists idx_comments_entity on public.comments (org_id, entity_type, entity_id, created_at);

-- supabase/migrations/20260404001000_add_comments_table.sql
create index if not exists idx_comments_user on public.comments (user_id);

-- supabase/migrations/20260405000000_evidence_memory_v1.sql
create index if not exists idx_source_records_org_account on source_records(org_id, account_id, occurred_at desc);

-- supabase/migrations/20260405000000_evidence_memory_v1.sql
create index if not exists idx_account_memory_snapshots_org_account on account_memory_snapshots(org_id, account_id, computed_at desc);

-- supabase/migrations/20260405000000_evidence_memory_v1.sql
create index if not exists idx_memory_conflicts_org_account on memory_conflicts(org_id, account_id, detected_at desc);

-- supabase/migrations/20260405000200_compiled_intelligence_layer.sql
create index if not exists idx_account_knowledge_pages_org_account
  on account_knowledge_pages(org_id, account_id);

-- supabase/migrations/20260405000200_compiled_intelligence_layer.sql
create index if not exists idx_account_knowledge_pages_type
  on account_knowledge_pages(org_id, page_type);

-- supabase/migrations/20260405000200_compiled_intelligence_layer.sql
create index if not exists idx_account_claims_org_account
  on account_claims(org_id, account_id);

-- supabase/migrations/20260405000200_compiled_intelligence_layer.sql
create index if not exists idx_account_claims_status
  on account_claims(org_id, status) where status = 'active';

-- supabase/migrations/20260405000200_compiled_intelligence_layer.sql
create index if not exists idx_account_claims_type
  on account_claims(org_id, claim_type);

-- supabase/migrations/20260405000200_compiled_intelligence_layer.sql
create index if not exists idx_account_evidence_org_account
  on account_evidence(org_id, account_id, occurred_at desc);

-- supabase/migrations/20260405000200_compiled_intelligence_layer.sql
create index if not exists idx_account_evidence_source
  on account_evidence(org_id, source_id);

-- supabase/migrations/20260405000200_compiled_intelligence_layer.sql
create index if not exists idx_account_evidence_type
  on account_evidence(org_id, evidence_type);

-- supabase/migrations/20260405000200_compiled_intelligence_layer.sql
create index if not exists idx_account_open_questions_org_account
  on account_open_questions(org_id, account_id);

-- supabase/migrations/20260405000200_compiled_intelligence_layer.sql
create index if not exists idx_account_open_questions_status
  on account_open_questions(org_id, status) where status = 'open';

-- supabase/migrations/20260405000200_compiled_intelligence_layer.sql
create index if not exists idx_knowledge_update_log_org_account
  on knowledge_update_log(org_id, account_id, created_at desc);

-- supabase/migrations/20260418000000_database_fixes.sql
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(org_id, stage);

-- supabase/migrations/20260418000000_database_fixes.sql
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity
  ON activity_logs(entity_type, entity_id, created_at DESC);

-- supabase/migrations/20260418000000_database_fixes.sql
CREATE INDEX IF NOT EXISTS idx_ai_insights_updated_at ON ai_insights(updated_at);

-- supabase/migrations/20260418000000_database_fixes.sql
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(org_id, status);

-- supabase/migrations/20260418000000_database_fixes.sql
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(org_id, due_date);

-- supabase/migrations/20260418000000_database_fixes.sql
CREATE INDEX IF NOT EXISTS idx_intel_items_opportunity_id ON intel_items(opportunity_id);

-- supabase/migrations/20260418000000_database_fixes.sql
CREATE INDEX IF NOT EXISTS idx_composed_emails_opportunity_id ON composed_emails(opportunity_id);

-- supabase/migrations/20260418000000_database_fixes.sql
CREATE INDEX IF NOT EXISTS idx_email_decodes_opportunity_id ON email_decodes(opportunity_id);

-- supabase/migrations/20260428000000_ai_invocation_logs.sql
CREATE INDEX IF NOT EXISTS idx_ai_invocation_logs_org_created
  ON ai_invocation_logs (org_id, created_at DESC);

-- supabase/migrations/20260428000000_ai_invocation_logs.sql
CREATE INDEX IF NOT EXISTS idx_ai_invocation_logs_user_created
  ON ai_invocation_logs (user_id, created_at DESC);

-- supabase/migrations/20260428000000_ai_invocation_logs.sql
CREATE INDEX IF NOT EXISTS idx_ai_invocation_logs_route_created
  ON ai_invocation_logs (route, created_at DESC);

-- supabase/migrations/20260428000000_ai_invocation_logs.sql
CREATE INDEX IF NOT EXISTS idx_ai_invocation_logs_status_created
  ON ai_invocation_logs (status, created_at DESC);

-- supabase/migrations/20260506120000_strategic_play_schema_v1.sql
CREATE INDEX IF NOT EXISTS idx_strategic_plays_org_id ON strategic_plays(org_id);

-- supabase/migrations/20260506120000_strategic_play_schema_v1.sql
CREATE INDEX IF NOT EXISTS idx_strategic_plays_account_id ON strategic_plays(account_id);

-- supabase/migrations/20260506120000_strategic_play_schema_v1.sql
CREATE INDEX IF NOT EXISTS idx_strategic_plays_status ON strategic_plays(status) WHERE status IN ('active', 'in_progress');

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create unique index if not exists accounts_id_org_id_uidx on accounts(id, org_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create unique index if not exists contacts_id_org_id_uidx on contacts(id, org_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create unique index if not exists opportunities_id_org_id_uidx on opportunities(id, org_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create unique index if not exists teams_id_org_id_uidx on teams(id, org_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create unique index if not exists strategic_plays_id_org_id_uidx on strategic_plays(id, org_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create unique index if not exists pursuit_teams_id_org_id_uidx on pursuit_teams(id, org_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create unique index if not exists pursuit_team_members_id_org_id_uidx on pursuit_team_members(id, org_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create unique index if not exists contact_coverage_assignments_id_org_id_uidx on contact_coverage_assignments(id, org_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create unique index if not exists responsibility_catalog_system_key_uidx on responsibility_catalog(key) where is_system = true;

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create unique index if not exists responsibility_catalog_org_key_uidx on responsibility_catalog(org_id, key) where is_system = false;

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create unique index if not exists pursuit_teams_one_active_account_uidx on pursuit_teams(org_id, account_id) where status = 'active' and opportunity_id is null and strategic_play_id is null;

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create index if not exists idx_accounts_business_team_id on accounts(business_team_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create index if not exists idx_pursuit_teams_org_account on pursuit_teams(org_id, account_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create index if not exists idx_pursuit_teams_parent_team_id on pursuit_teams(parent_team_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create index if not exists idx_pursuit_team_members_team on pursuit_team_members(pursuit_team_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create index if not exists idx_pursuit_team_member_responsibilities_member on pursuit_team_member_responsibilities(pursuit_team_member_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create index if not exists idx_contact_coverage_assignments_team on contact_coverage_assignments(pursuit_team_id);

-- supabase/migrations/20260513170000_account_team_intelligence_p0.sql
create index if not exists idx_contact_coverage_assignments_contact on contact_coverage_assignments(contact_id);

-- supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
create unique index if not exists relationship_signals_dedupe_uidx
  on relationship_signals(org_id, source_table, source_row_id, signal_kind, coalesce(contact_id, ''), coalesce(actor_user_id::text, ''))
  where source_table is not null and source_row_id is not null;

-- supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
create unique index if not exists relationship_signals_id_org_id_uidx on relationship_signals(id, org_id);

-- supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
create index if not exists idx_relationship_signals_org_account on relationship_signals(org_id, account_id, occurred_at desc);

-- supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
create index if not exists idx_relationship_signals_contact on relationship_signals(org_id, contact_id, occurred_at desc);

-- supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
create index if not exists idx_relationship_signals_actor on relationship_signals(org_id, actor_user_id, occurred_at desc);

-- supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
create unique index if not exists relationship_edges_user_contact_uidx
  on relationship_edges(org_id, account_id, from_user_id, to_contact_id, edge_type)
  where from_user_id is not null and from_contact_id is null;

-- supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
create unique index if not exists relationship_edges_contact_contact_uidx
  on relationship_edges(org_id, account_id, from_contact_id, to_contact_id, edge_type)
  where from_contact_id is not null;

-- supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
create index if not exists idx_relationship_edges_org_account on relationship_edges(org_id, account_id, computed_at desc);

-- supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
create index if not exists idx_relationship_edges_to_contact on relationship_edges(org_id, to_contact_id);

-- supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
create index if not exists idx_relationship_edges_from_user on relationship_edges(org_id, from_user_id);

-- supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
create index if not exists idx_contact_coverage_assignments_health on contact_coverage_assignments(org_id, account_id, coverage_health);

-- supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
create index if not exists idx_contact_coverage_assignments_next_touch on contact_coverage_assignments(org_id, next_touch_due_at);

-- supabase/migrations/20260514025000_relationship_intelligence_foundation.sql
create index if not exists idx_contact_coverage_assignments_last_signal on contact_coverage_assignments(last_signal_id);

-- supabase/migrations/20260514062000_fix_local_qa_schema_gaps.sql
create index if not exists idx_contacts_role_confidence
  on contacts(org_id, role, role_confidence);

-- supabase/migrations/20260514062000_fix_local_qa_schema_gaps.sql
create index if not exists idx_contacts_job_level
  on contacts(org_id, job_level)
  where job_level is not null;

-- supabase/migrations/20260514062000_fix_local_qa_schema_gaps.sql
create index if not exists idx_accounts_owner_id on accounts(owner_id);

-- supabase/migrations/20260514062000_fix_local_qa_schema_gaps.sql
create index if not exists idx_accounts_visibility on accounts(visibility);

-- supabase/migrations/20260514062000_fix_local_qa_schema_gaps.sql
create index if not exists idx_opportunities_visibility on opportunities(visibility);

-- supabase/migrations/20260514062000_fix_local_qa_schema_gaps.sql
create index if not exists idx_intel_items_created_by on intel_items(created_by);

-- supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
create unique index if not exists pallas_artifacts_id_org_id_uidx on pallas_artifacts(id, org_id);

-- supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
create index if not exists idx_pallas_artifacts_org_context on pallas_artifacts(org_id, entity_type, entity_id, created_at desc);

-- supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
create index if not exists idx_pallas_artifacts_account on pallas_artifacts(org_id, account_id, created_at desc);

-- supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
create index if not exists idx_pallas_artifacts_kind on pallas_artifacts(org_id, kind, created_at desc);

-- supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
create index if not exists idx_pallas_artifact_versions_artifact on pallas_artifact_versions(artifact_id, version desc);

-- supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
create unique index if not exists pallas_action_proposals_id_org_id_uidx on pallas_action_proposals(id, org_id);

-- supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
create index if not exists idx_pallas_action_proposals_org_status on pallas_action_proposals(org_id, status, created_at desc);

-- supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
create index if not exists idx_pallas_action_proposals_context on pallas_action_proposals(org_id, entity_type, entity_id, created_at desc);

-- supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
create index if not exists idx_pallas_action_proposals_artifact on pallas_action_proposals(artifact_id, created_at desc);

-- supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
create index if not exists idx_pallas_tool_runs_proposal on pallas_tool_runs(proposal_id, created_at desc);

-- supabase/migrations/20260517011000_pallas_artifact_workbench_foundation.sql
create index if not exists idx_pallas_tool_runs_org_status on pallas_tool_runs(org_id, status, created_at desc);

-- supabase/migrations/20260517113000_pallas_action_proposal_reuse_key.sql
create unique index if not exists pallas_action_proposals_active_reuse_key_uidx
  on pallas_action_proposals(org_id, reuse_key)
  where status = 'awaiting_confirmation' and reuse_key is not null;

-- supabase/migrations/20260517113000_pallas_action_proposal_reuse_key.sql
create index if not exists idx_pallas_action_proposals_reuse_key
  on pallas_action_proposals(org_id, reuse_key, status, created_at desc)
  where reuse_key is not null;

-- supabase/migrations/20260517143000_pallas_task_execution_idempotency.sql
create unique index if not exists tasks_pallas_proposal_source_uidx
  on tasks(org_id, source_id)
  where source_id like 'pallas_proposal:%';

-- supabase/migrations/20260517224000_judgment_ownership_assignments.sql
create unique index if not exists judgment_ownership_account_active_uidx
  on judgment_ownership_assignments(org_id, account_id, judgment_type)
  where status = 'active' and opportunity_id is null and strategic_play_id is null;

-- supabase/migrations/20260517224000_judgment_ownership_assignments.sql
create unique index if not exists judgment_ownership_opportunity_active_uidx
  on judgment_ownership_assignments(org_id, opportunity_id, judgment_type)
  where status = 'active' and opportunity_id is not null and strategic_play_id is null;

-- supabase/migrations/20260517224000_judgment_ownership_assignments.sql
create unique index if not exists judgment_ownership_play_active_uidx
  on judgment_ownership_assignments(org_id, strategic_play_id, judgment_type)
  where status = 'active' and strategic_play_id is not null;

-- supabase/migrations/20260517224000_judgment_ownership_assignments.sql
create index if not exists idx_judgment_ownership_org_account
  on judgment_ownership_assignments(org_id, account_id, status, updated_at desc);

-- supabase/migrations/20260517224000_judgment_ownership_assignments.sql
create index if not exists idx_judgment_ownership_assignee
  on judgment_ownership_assignments(org_id, assigned_user_id, status, due_at);

-- supabase/migrations/20260611205000_leads_persistence.sql
create index if not exists idx_leads_org_status_updated on leads(org_id, status, updated_at desc);

-- supabase/migrations/20260611205000_leads_persistence.sql
create index if not exists idx_leads_org_owner on leads(org_id, owner_id);

-- supabase/migrations/20260611205000_leads_persistence.sql
create index if not exists idx_leads_org_email on leads(org_id, lower(email)) where email is not null;

-- supabase/migrations/20260611205000_leads_persistence.sql
create index if not exists idx_leads_org_company on leads(org_id, lower(company_name));

-- supabase/migrations/20260611211000_strategic_play_route_plan_v2.sql
CREATE INDEX IF NOT EXISTS idx_strategic_plays_win_gaps_gin ON strategic_plays USING gin (win_gaps);

-- supabase/migrations/20260611211000_strategic_play_route_plan_v2.sql
CREATE INDEX IF NOT EXISTS idx_strategic_plays_play_versions_gin ON strategic_plays USING gin (play_versions);

-- supabase/migrations/20260612013000_contact_opportunity_roles.sql
create index if not exists idx_contact_opportunity_roles_org_opp on contact_opportunity_roles(org_id, opportunity_id);

-- supabase/migrations/20260612013000_contact_opportunity_roles.sql
create index if not exists idx_contact_opportunity_roles_org_contact on contact_opportunity_roles(org_id, contact_id);

-- supabase/migrations/20260612013000_contact_opportunity_roles.sql
create index if not exists idx_contact_opportunity_roles_owner on contact_opportunity_roles(org_id, relationship_owner_id);

-- supabase/migrations/20260612014000_timeline_events.sql
create index if not exists idx_timeline_events_org_time on timeline_events(org_id, occurred_at desc);

-- supabase/migrations/20260612014000_timeline_events.sql
create index if not exists idx_timeline_events_org_opp_time on timeline_events(org_id, opportunity_id, occurred_at desc);

-- supabase/migrations/20260612014000_timeline_events.sql
create index if not exists idx_timeline_events_org_account_time on timeline_events(org_id, account_id, occurred_at desc);

-- supabase/migrations/20260612014000_timeline_events.sql
create index if not exists idx_timeline_event_links_entity on timeline_event_links(org_id, entity_type, entity_id);

-- supabase/migrations/20260612014000_timeline_events.sql
create index if not exists idx_stage_history_org_opp_time on opportunity_stage_history(org_id, opportunity_id, changed_at desc);

-- supabase/migrations/20260612014000_timeline_events.sql
create index if not exists idx_close_date_history_org_opp_time on opportunity_close_date_history(org_id, opportunity_id, changed_at desc);

-- src/lib/migrations/001_ai_event_pipeline.sql
create index if not exists idx_ai_insights_org_id on ai_insights(org_id);

-- src/lib/migrations/001_ai_event_pipeline.sql
create index if not exists idx_ai_insights_entity on ai_insights(entity_type, entity_id);

-- src/lib/migrations/001_ai_event_pipeline.sql
create index if not exists idx_ai_insights_type on ai_insights(org_id, insight_type);

-- src/lib/migrations/001_ai_event_pipeline.sql
create index if not exists idx_ai_events_org_id on ai_events(org_id);

-- src/lib/migrations/001_ai_event_pipeline.sql
create index if not exists idx_ai_events_status on ai_events(status) where status = 'pending';

-- src/lib/migrations/001_ai_event_pipeline.sql
create index if not exists idx_ai_events_entity on ai_events(entity_type, entity_id);

-- src/lib/migrations/001_ai_event_pipeline.sql
create index if not exists idx_ai_events_created on ai_events(created_at desc);

-- src/lib/migrations/003_channel_partners.sql
create index if not exists idx_channel_partners_org_id on channel_partners(org_id);

-- src/lib/migrations/003_channel_partners.sql
create index if not exists idx_deal_registrations_org_id on deal_registrations(org_id);

-- src/lib/migrations/003_channel_partners.sql
create index if not exists idx_deal_registrations_partner_id on deal_registrations(partner_id);

-- src/lib/migrations/004_permissions_and_ownership.sql
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned_to ON opportunities(assigned_to);

-- src/lib/migrations/004_permissions_and_ownership.sql
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);

-- src/lib/migrations/005_quota_forecast.sql
CREATE INDEX IF NOT EXISTS idx_quotas_org ON quotas(org_id);

-- src/lib/migrations/005_quota_forecast.sql
CREATE INDEX IF NOT EXISTS idx_quotas_user ON quotas(user_id);

-- src/lib/migrations/005_quota_forecast.sql
CREATE INDEX IF NOT EXISTS idx_quotas_period ON quotas(period_start, period_end);

-- src/lib/migrations/005_quota_forecast.sql
CREATE INDEX IF NOT EXISTS idx_forecasts_org ON forecasts(org_id);

-- src/lib/migrations/005_quota_forecast.sql
CREATE INDEX IF NOT EXISTS idx_forecasts_user ON forecasts(user_id);

-- src/lib/migrations/005_quota_forecast.sql
CREATE INDEX IF NOT EXISTS idx_forecasts_period ON forecasts(period_start, period_end);

-- src/lib/migrations/006_enterprise_permissions.sql
CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_log(org_id, created_at DESC);

-- src/lib/migrations/006_enterprise_permissions.sql
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);

-- src/lib/migrations/006_enterprise_permissions.sql
CREATE INDEX IF NOT EXISTS idx_record_shares_org ON record_shares(org_id, object_type, record_id);

-- src/lib/migrations/006_enterprise_permissions.sql
CREATE INDEX IF NOT EXISTS idx_ownership_transfers_org ON ownership_transfers(org_id, created_at DESC);

-- src/lib/migrations/006_integration_tables.sql
CREATE INDEX IF NOT EXISTS idx_integration_connections_org ON integration_connections(org_id);

-- src/lib/migrations/006_integration_tables.sql
CREATE INDEX IF NOT EXISTS idx_integration_emails_org ON integration_emails(org_id);

-- src/lib/migrations/006_integration_tables.sql
CREATE INDEX IF NOT EXISTS idx_integration_emails_message_id ON integration_emails(org_id, message_id);

-- src/lib/migrations/006_integration_tables.sql
CREATE INDEX IF NOT EXISTS idx_integration_emails_account ON integration_emails(account_id);

-- src/lib/migrations/006_integration_tables.sql
CREATE INDEX IF NOT EXISTS idx_integration_emails_contact ON integration_emails(contact_id);

-- src/lib/migrations/006_integration_tables.sql
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_time ON integration_audit_logs(org_id, created_at DESC);

-- src/lib/migrations/006_integration_tables.sql
CREATE INDEX IF NOT EXISTS idx_agent_notifications_user ON agent_notifications(org_id, user_id, read);

-- src/lib/migrations/007_products_quotes.sql
CREATE INDEX IF NOT EXISTS idx_products_org ON products(org_id);

-- src/lib/migrations/007_products_quotes.sql
CREATE INDEX IF NOT EXISTS idx_quotes_org ON quotes(org_id);

-- src/lib/migrations/007_products_quotes.sql
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);

-- src/lib/migrations/008_meeting_recordings.sql
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_org ON meeting_recordings(org_id);

-- src/lib/migrations/008_meeting_recordings.sql
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_account ON meeting_recordings(account_id);

-- src/lib/migrations/010_wecom_data_tables.sql
CREATE INDEX IF NOT EXISTS idx_wecom_contacts_org ON integration_wecom_contacts(org_id);

-- src/lib/migrations/010_wecom_data_tables.sql
CREATE INDEX IF NOT EXISTS idx_wecom_contacts_account ON integration_wecom_contacts(account_id);

-- src/lib/migrations/010_wecom_data_tables.sql
CREATE INDEX IF NOT EXISTS idx_wecom_contacts_contact ON integration_wecom_contacts(contact_id);

-- src/lib/migrations/010_wecom_data_tables.sql
CREATE INDEX IF NOT EXISTS idx_wecom_groups_org ON integration_wecom_groups(org_id);

-- src/lib/migrations/011_integration_fixes.sql
CREATE INDEX IF NOT EXISTS idx_integration_emails_received
  ON integration_emails(org_id, received_at DESC);

-- src/lib/migrations/011_integration_fixes.sql
CREATE INDEX IF NOT EXISTS idx_integration_emails_account_time
  ON integration_emails(account_id, received_at DESC);

-- src/lib/migrations/018_contact_role_enrichment.sql
CREATE INDEX IF NOT EXISTS idx_contacts_enrichment_status
  ON contacts(org_id, enrichment_status)
  WHERE enrichment_status = 'pending';

-- src/lib/migrations/018_contact_role_enrichment.sql
CREATE INDEX IF NOT EXISTS idx_opp_contacts_opportunity
  ON opportunity_contacts(org_id, opportunity_id)
  WHERE is_active = true;

-- src/lib/migrations/018_contact_role_enrichment.sql
CREATE INDEX IF NOT EXISTS idx_opp_contacts_contact
  ON opportunity_contacts(org_id, contact_id)
  WHERE is_active = true;

-- src/lib/migrations/018_contact_role_enrichment.sql
CREATE INDEX IF NOT EXISTS idx_opp_contacts_deal_role
  ON opportunity_contacts(org_id, deal_role)
  WHERE is_active = true;

-- src/lib/migrations/018_contact_role_enrichment.sql
CREATE INDEX IF NOT EXISTS idx_enrichment_log_contact
  ON contact_enrichment_log(org_id, contact_id, created_at DESC);

-- src/lib/migrations/018_contact_role_enrichment.sql
CREATE INDEX IF NOT EXISTS idx_enrichment_log_source
  ON contact_enrichment_log(org_id, source, created_at DESC);

-- src/lib/migrations/018_contact_role_enrichment.sql
CREATE INDEX IF NOT EXISTS idx_intel_writeback_pending
  ON intel_items(org_id, writeback_status)
  WHERE writeback_status = 'pending';

-- src/lib/migrations/019_rfp_system.sql
create index if not exists idx_rfps_org_account
  on rfps(org_id, account_id);

-- src/lib/migrations/019_rfp_system.sql
create index if not exists idx_rfps_org_opportunity
  on rfps(org_id, opportunity_id);

-- src/lib/migrations/019_rfp_system.sql
create index if not exists idx_rfps_org_status
  on rfps(org_id, status) where status not in ('won', 'lost', 'no_bid');

-- src/lib/migrations/019_rfp_system.sql
create index if not exists idx_rfps_due_date
  on rfps(org_id, due_date) where due_date is not null;

-- src/lib/migrations/019_rfp_system.sql
create index if not exists idx_rfps_linked_play
  on rfps(linked_play_id) where linked_play_id is not null;

-- src/lib/migrations/019_rfp_system.sql
create index if not exists idx_rfp_documents_rfp
  on rfp_documents(org_id, rfp_id);

-- src/lib/migrations/019_rfp_system.sql
create index if not exists idx_rfp_milestones_rfp
  on rfp_milestones(org_id, rfp_id);

-- src/lib/migrations/019_rfp_system.sql
create index if not exists idx_rfp_milestones_status
  on rfp_milestones(org_id, status) where status in ('pending', 'overdue');

-- src/lib/migrations/019_rfp_system.sql
create index if not exists idx_rfp_milestones_due
  on rfp_milestones(org_id, due_date) where status = 'pending';

-- src/lib/migrations/019_rfp_system.sql
create index if not exists idx_rfp_competitors_rfp
  on rfp_competitors(org_id, rfp_id);

-- src/lib/migrations/019_rfp_system.sql
create index if not exists idx_rfp_ai_analyses_rfp
  on rfp_ai_analyses(org_id, rfp_id, created_at desc);

-- src/lib/migrations/020_knowledge_base_ai_source.sql
CREATE INDEX IF NOT EXISTS idx_knowledge_base_source
  ON knowledge_base(source);

-- src/lib/migrations/020_knowledge_base_ai_source.sql
CREATE INDEX IF NOT EXISTS idx_knowledge_base_source_ref
  ON knowledge_base(source_type, source_id)
  WHERE source_id IS NOT NULL;

-- src/lib/migrations/020_knowledge_base_ai_source.sql
CREATE INDEX IF NOT EXISTS idx_knowledge_base_org_source
  ON knowledge_base(org_id, source)
  WHERE source <> 'manual';

-- src/lib/migrations/020_knowledge_base_ai_source.sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_base_source_dedup
  ON knowledge_base(org_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

-- src/lib/migrations/021_ai_forecasts.sql
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_org_opp_user
  ON ai_forecasts(org_id, opportunity_id, user_id, created_at DESC);

-- src/lib/migrations/022_dashboard_config.sql
create index if not exists idx_dashboard_configs_org
  on org_dashboard_configs(org_id);

-- src/lib/migrations/024_signal_status.sql
create index if not exists idx_email_decodes_signal_status
  on public.email_decodes (org_id, signal_status, created_at desc);

-- src/lib/migrations/033_crm_import_governance.sql
CREATE INDEX IF NOT EXISTS idx_import_jobs_org_created ON import_jobs(org_id, created_at DESC);

-- src/lib/migrations/033_crm_import_governance.sql
CREATE INDEX IF NOT EXISTS idx_import_rows_job ON import_rows(import_job_id, row_index);

-- src/lib/migrations/033_crm_import_governance.sql
CREATE INDEX IF NOT EXISTS idx_field_mappings_job ON field_mappings(import_job_id);

-- src/lib/migrations/033_crm_import_governance.sql
CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_job ON duplicate_candidates(import_job_id);

-- src/lib/migrations/033_crm_import_governance.sql
CREATE INDEX IF NOT EXISTS idx_merge_decisions_job ON merge_decisions(import_job_id);

-- src/lib/migrations/033_crm_import_governance.sql
CREATE INDEX IF NOT EXISTS idx_data_quality_findings_org_status ON data_quality_findings(org_id, status, created_at DESC);

-- src/lib/migrations/038_engine_core.sql
CREATE INDEX IF NOT EXISTS idx_engine_source_records_tenant_account ON engine_source_records(tenant_id, account_id, occurred_at DESC);

-- src/lib/migrations/038_engine_core.sql
CREATE INDEX IF NOT EXISTS idx_engine_source_records_tenant_opportunity ON engine_source_records(tenant_id, opportunity_id, occurred_at DESC);

-- src/lib/migrations/038_engine_core.sql
CREATE INDEX IF NOT EXISTS idx_engine_evidence_refs_source ON engine_evidence_refs(source_record_id);

-- src/lib/migrations/038_engine_core.sql
CREATE INDEX IF NOT EXISTS idx_engine_judgments_tenant_account ON engine_judgments(tenant_id, account_id, updated_at DESC);

-- src/lib/migrations/038_engine_core.sql
CREATE INDEX IF NOT EXISTS idx_engine_win_gaps_tenant_account ON engine_win_gaps(tenant_id, account_id, status);

-- src/lib/migrations/038_engine_core.sql
CREATE INDEX IF NOT EXISTS idx_engine_moves_gap ON engine_moves(win_gap_id);

-- src/lib/migrations/038_engine_core.sql
CREATE INDEX IF NOT EXISTS idx_engine_audit_events_tenant_created ON engine_audit_events(tenant_id, created_at DESC);

-- src/lib/migrations/play-v2.sql
CREATE INDEX IF NOT EXISTS idx_play_relationships_source ON play_relationships(source_play_id);

-- src/lib/migrations/play-v2.sql
CREATE INDEX IF NOT EXISTS idx_play_relationships_target ON play_relationships(target_play_id);

-- src/lib/migrations/play-v2.sql
CREATE INDEX IF NOT EXISTS idx_play_relationships_org ON play_relationships(org_id);

-- src/lib/migrations/play-v2.sql
CREATE INDEX IF NOT EXISTS idx_strategic_plays_momentum ON strategic_plays(momentum);

-- src/lib/migrations/play-v2.sql
CREATE INDEX IF NOT EXISTS idx_strategic_plays_last_step ON strategic_plays(last_step_at);
CREATE UNIQUE INDEX IF NOT EXISTS user_settings_native_user_id_key ON public.user_settings(user_id);
