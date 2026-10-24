-- Migration: Add user_id + RLS for multi-tenant support
-- Run this in Supabase SQL editor

-- Add user_id column to all tables
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE intel_items ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE email_decodes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE composed_emails ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE meeting_preps ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE discovery_notes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- Create indexes on user_id
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_user_id ON opportunities(user_id);
CREATE INDEX IF NOT EXISTS idx_intel_items_user_id ON intel_items(user_id);
CREATE INDEX IF NOT EXISTS idx_email_decodes_user_id ON email_decodes(user_id);
CREATE INDEX IF NOT EXISTS idx_composed_emails_user_id ON composed_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_preps_user_id ON meeting_preps(user_id);
CREATE INDEX IF NOT EXISTS idx_discovery_notes_user_id ON discovery_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_id ON knowledge_items(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Enable RLS on all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_decodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE composed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_preps ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: each user sees only their own data
-- accounts
CREATE POLICY "accounts_select" ON accounts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "accounts_insert" ON accounts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "accounts_update" ON accounts FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "accounts_delete" ON accounts FOR DELETE USING (user_id = auth.uid());

-- contacts
CREATE POLICY "contacts_select" ON contacts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "contacts_insert" ON contacts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "contacts_update" ON contacts FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "contacts_delete" ON contacts FOR DELETE USING (user_id = auth.uid());

-- opportunities
CREATE POLICY "opportunities_select" ON opportunities FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "opportunities_insert" ON opportunities FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "opportunities_update" ON opportunities FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "opportunities_delete" ON opportunities FOR DELETE USING (user_id = auth.uid());

-- intel_items
CREATE POLICY "intel_items_select" ON intel_items FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "intel_items_insert" ON intel_items FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "intel_items_update" ON intel_items FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "intel_items_delete" ON intel_items FOR DELETE USING (user_id = auth.uid());

-- email_decodes
CREATE POLICY "email_decodes_select" ON email_decodes FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "email_decodes_insert" ON email_decodes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "email_decodes_update" ON email_decodes FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "email_decodes_delete" ON email_decodes FOR DELETE USING (user_id = auth.uid());

-- composed_emails
CREATE POLICY "composed_emails_select" ON composed_emails FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "composed_emails_insert" ON composed_emails FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "composed_emails_update" ON composed_emails FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "composed_emails_delete" ON composed_emails FOR DELETE USING (user_id = auth.uid());

-- meeting_preps
CREATE POLICY "meeting_preps_select" ON meeting_preps FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "meeting_preps_insert" ON meeting_preps FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "meeting_preps_update" ON meeting_preps FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "meeting_preps_delete" ON meeting_preps FOR DELETE USING (user_id = auth.uid());

-- discovery_notes
CREATE POLICY "discovery_notes_select" ON discovery_notes FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "discovery_notes_insert" ON discovery_notes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "discovery_notes_update" ON discovery_notes FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "discovery_notes_delete" ON discovery_notes FOR DELETE USING (user_id = auth.uid());

-- knowledge_items
CREATE POLICY "knowledge_items_select" ON knowledge_items FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "knowledge_items_insert" ON knowledge_items FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "knowledge_items_update" ON knowledge_items FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "knowledge_items_delete" ON knowledge_items FOR DELETE USING (user_id = auth.uid());

-- user_settings
CREATE POLICY "user_settings_select" ON user_settings FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_settings_insert" ON user_settings FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_settings_update" ON user_settings FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "user_settings_delete" ON user_settings FOR DELETE USING (user_id = auth.uid());
