-- 013: Fix integration_emails FK columns from uuid to text
-- Reason: accounts/contacts/opportunities all use text primary keys (e.g. "acc_huawei_001"),
-- but integration_emails.account_id/contact_id/opportunity_id were created as uuid.
-- This causes insert failures when seeding with text-based IDs.
-- 幂等：使用 ALTER COLUMN ... TYPE text（对已经是 text 的列无副作用）

ALTER TABLE integration_emails ALTER COLUMN account_id TYPE text USING account_id::text;
ALTER TABLE integration_emails ALTER COLUMN contact_id TYPE text USING contact_id::text;
ALTER TABLE integration_emails ALTER COLUMN opportunity_id TYPE text USING opportunity_id::text;
