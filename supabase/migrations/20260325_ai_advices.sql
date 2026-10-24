-- AI Advices table
CREATE TABLE IF NOT EXISTS ai_advices (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID,
  text TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('strategy', 'intel', 'meddicc')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'adopted', 'ignored', 'completed')),
  account_id TEXT,
  opportunity_id TEXT,
  task_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Decode Feedbacks table
CREATE TABLE IF NOT EXISTS decode_feedbacks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID,
  decode_id TEXT NOT NULL,
  accurate BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE ai_advices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own ai_advices" ON ai_advices FOR ALL USING (auth.uid() = user_id);

ALTER TABLE decode_feedbacks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own decode_feedbacks" ON decode_feedbacks FOR ALL USING (auth.uid() = user_id);
