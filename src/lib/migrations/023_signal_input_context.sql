-- 023_signal_input_context.sql
-- Preserve manual signal-entry context for Decode records.

ALTER TABLE email_decodes
  ADD COLUMN IF NOT EXISTS signal_source text,
  ADD COLUMN IF NOT EXISTS analysis_goal text,
  ADD COLUMN IF NOT EXISTS signal_context text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_decodes_signal_source_check'
  ) THEN
    ALTER TABLE email_decodes ADD CONSTRAINT email_decodes_signal_source_check
      CHECK (
        signal_source IS NULL
        OR signal_source IN ('email', 'meeting', 'call', 'chat', 'intel', 'other')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_decodes_analysis_goal_check'
  ) THEN
    ALTER TABLE email_decodes ADD CONSTRAINT email_decodes_analysis_goal_check
      CHECK (
        analysis_goal IS NULL
        OR analysis_goal IN ('auto', 'attitude', 'risk', 'reply', 'deal_update', 'next_action')
      );
  END IF;
END $$;
