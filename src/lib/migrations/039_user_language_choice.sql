-- Track explicit post-login language confirmation per user.
-- Existing users have NULL so they will see the language choice once after this migration.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS language_selected_at timestamptz;
