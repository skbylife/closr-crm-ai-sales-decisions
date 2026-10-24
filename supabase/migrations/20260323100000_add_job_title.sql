-- Add job_title to org_memberships for admin-assigned role level (ae/manager/executive/admin)
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS job_title text DEFAULT 'ae';
