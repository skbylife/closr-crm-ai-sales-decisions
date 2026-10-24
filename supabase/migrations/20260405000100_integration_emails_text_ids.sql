-- Fix integration_emails FK columns from uuid to text
-- Reason: accounts/contacts/opportunities all use text primary keys (e.g. "acc_huawei_001"),
-- but integration_emails.account_id/contact_id/opportunity_id were created as uuid.
-- This causes insert failures when seeding with text-based IDs.
-- Fresh local resets may not include the older app-side integration tables yet, so guard the patch.

DO $$
BEGIN
  IF to_regclass('public.integration_emails') IS NOT NULL THEN
    ALTER TABLE integration_emails ALTER COLUMN account_id TYPE text USING account_id::text;
    ALTER TABLE integration_emails ALTER COLUMN contact_id TYPE text USING contact_id::text;
    ALTER TABLE integration_emails ALTER COLUMN opportunity_id TYPE text USING opportunity_id::text;
  END IF;
END $$;
