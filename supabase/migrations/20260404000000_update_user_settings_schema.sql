-- Migrate user_settings table to new schema with proper columns
-- Old schema: id, user_name, role, role_level, gemini_key, targets, created_at
-- New schema: adds user_id, display_name, email, role_description, company_domain,
--             job_level, currency_code, quarterly_target, monthly_target, coverage_target,
--             notification_prefs, locale, pipeline_stages, chat_history, updated_at

-- Add user_id column (maps auth.users)
alter table user_settings add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Add display/profile columns
alter table user_settings add column if not exists display_name text;
alter table user_settings add column if not exists email text;
alter table user_settings add column if not exists role_description text;
alter table user_settings add column if not exists company_domain text;
alter table user_settings add column if not exists job_level integer default 0;

-- Add business settings
alter table user_settings add column if not exists currency_code text default 'CNY';
alter table user_settings add column if not exists quarterly_target numeric default 0;
alter table user_settings add column if not exists monthly_target numeric default 0;
alter table user_settings add column if not exists coverage_target numeric default 3;

-- Add notification and locale
alter table user_settings add column if not exists notification_prefs jsonb;
alter table user_settings add column if not exists locale text default 'zh';

-- Add pipeline stages and chat history (JSON blobs)
alter table user_settings add column if not exists pipeline_stages jsonb;
alter table user_settings add column if not exists chat_history jsonb;

-- Add updated_at
alter table user_settings add column if not exists updated_at timestamptz default now();

-- Create unique index on user_id for upsert conflict resolution
create unique index if not exists user_settings_user_id_key on user_settings(user_id);

-- Enable RLS if not already
alter table user_settings enable row level security;

-- RLS: users can only see/edit their own settings
drop policy if exists "user_settings_self" on user_settings;
create policy "user_settings_self" on user_settings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
