-- 005_quota_forecast.sql
-- Phase 2: Quota & Forecast

-- 配额表
CREATE TABLE IF NOT EXISTS quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  period_type text NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  target_amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'USD',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Forecast 表
CREATE TABLE IF NOT EXISTS forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  closed numeric DEFAULT 0,
  commit numeric DEFAULT 0,
  best_case numeric DEFAULT 0,
  pipeline numeric DEFAULT 0,
  ai_predicted numeric,
  notes text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, user_id, period_start, period_end)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_quotas_org ON quotas(org_id);
CREATE INDEX IF NOT EXISTS idx_quotas_user ON quotas(user_id);
CREATE INDEX IF NOT EXISTS idx_quotas_period ON quotas(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_forecasts_org ON forecasts(org_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_user ON forecasts(user_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_period ON forecasts(period_start, period_end);
