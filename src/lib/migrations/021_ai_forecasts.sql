-- AI Forecast persistence: store AI probability assessments per opportunity
-- NCR: Table was referenced by code but migration never applied to database
CREATE TABLE IF NOT EXISTS ai_forecasts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID,
  opportunity_id TEXT NOT NULL,
  ai_probability INTEGER NOT NULL,
  sales_probability INTEGER NOT NULL,
  gap INTEGER NOT NULL DEFAULT 0,
  factors JSONB DEFAULT '[]',
  risks JSONB DEFAULT '[]',
  recommendation TEXT DEFAULT '',
  dwell_days INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own forecasts"
  ON ai_forecasts FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_ai_forecasts_opp
  ON ai_forecasts(opportunity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_forecasts_org_opp_user
  ON ai_forecasts(org_id, opportunity_id, user_id, created_at DESC);
