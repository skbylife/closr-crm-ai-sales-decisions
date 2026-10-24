-- Add a stable reuse key for Pallas action proposals.
-- This gives preview-gated persisted proposals a DB-level guard against double-click races.

alter table pallas_action_proposals
  add column if not exists reuse_key text;

create unique index if not exists pallas_action_proposals_active_reuse_key_uidx
  on pallas_action_proposals(org_id, reuse_key)
  where status = 'awaiting_confirmation' and reuse_key is not null;

create index if not exists idx_pallas_action_proposals_reuse_key
  on pallas_action_proposals(org_id, reuse_key, status, created_at desc)
  where reuse_key is not null;

comment on column pallas_action_proposals.reuse_key is
  'Stable idempotency/reuse key for preview-gated Pallas proposals. Unique while status is awaiting_confirmation.';
