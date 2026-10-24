-- 007_add_job_title.sql
-- Add job_title column to org_memberships.
-- Idempotent: uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS job_title text default 'ae';
