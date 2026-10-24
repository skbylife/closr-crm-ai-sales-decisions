-- Add direction column to email_decodes for outbound email logging
ALTER TABLE email_decodes
  ADD COLUMN IF NOT EXISTS direction text DEFAULT 'inbound';
