-- User Settings table: stores per-user preferences (migrated from localStorage)
-- Uses user_id from Supabase Auth as primary key (one row per user)

CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  email text,
  role_description text,
  company_domain text,
  job_level integer DEFAULT 0,
  currency_code text DEFAULT 'CNY',
  quarterly_target numeric DEFAULT 0,
  monthly_target numeric DEFAULT 0,
  coverage_target numeric DEFAULT 3,
  notification_prefs jsonb DEFAULT '{"taskAssigned":true,"decodeComplete":true,"teamChange":true,"inApp":true}',
  locale text DEFAULT 'zh',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: users can only read/write their own settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can read own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);
