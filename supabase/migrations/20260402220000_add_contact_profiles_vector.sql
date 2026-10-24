-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Contact profiles with vector embeddings for semantic search
CREATE TABLE IF NOT EXISTS contact_profiles_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_id TEXT,
  linkedin_url TEXT,
  
  -- Basic info
  name TEXT NOT NULL,
  headline TEXT,
  current_company TEXT,
  location TEXT,
  
  -- DISC Analysis
  disc_primary TEXT CHECK (disc_primary IN ('D', 'I', 'S', 'C')),
  disc_secondary TEXT CHECK (disc_secondary IN ('D', 'I', 'S', 'C')),
  disc_confidence FLOAT DEFAULT 0,
  disc_evidence JSONB DEFAULT '[]',
  disc_approach TEXT,
  disc_risk_warnings JSONB DEFAULT '[]',
  optimal_channel TEXT DEFAULT 'linkedin_dm',
  opening_line_template TEXT,
  
  -- Outreach tracking
  outreach_count INT DEFAULT 0,
  last_outreach_at TIMESTAMPTZ,
  last_outreach_result TEXT,
  successful_strategies JSONB DEFAULT '[]',
  
  -- Raw data cache
  raw_linkedin_data JSONB,
  notes TEXT,
  
  -- Vector embedding (for semantic search)
  embedding vector(1536),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, linkedin_id)
);

-- Outreach logs
CREATE TABLE IF NOT EXISTS outreach_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES contact_profiles_v2(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  strategy_name TEXT,
  message_text TEXT,
  channel TEXT,
  result TEXT CHECK (result IN ('positive', 'negative', 'neutral', 'pending')),
  response_received BOOLEAN DEFAULT FALSE,
  response_time_hours INT,
  meeting_booked BOOLEAN DEFAULT FALSE,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Strategy cases knowledge base (from public data crawl)
CREATE TABLE IF NOT EXISTS strategy_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  situation TEXT NOT NULL,
  target_type TEXT,  -- VC, BD, executive, recruiter, etc.
  disc_type TEXT,
  approach TEXT NOT NULL,
  opening_line TEXT,
  result TEXT CHECK (result IN ('success', 'failure', 'neutral')),
  why_it_worked TEXT,
  source TEXT,  -- reddit, book, podcast, etc.
  tags TEXT[],
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS contact_profiles_v2_user_idx ON contact_profiles_v2(user_id);
CREATE INDEX IF NOT EXISTS contact_profiles_v2_embedding_idx ON contact_profiles_v2 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS strategy_cases_embedding_idx ON strategy_cases
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS outreach_logs_profile_idx ON outreach_logs(profile_id);

-- RLS policies
ALTER TABLE contact_profiles_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own profiles"
  ON contact_profiles_v2 FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own logs"
  ON outreach_logs FOR ALL
  USING (auth.uid() = user_id);

-- Strategy cases is public read
ALTER TABLE strategy_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read strategy cases"
  ON strategy_cases FOR SELECT
  USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contact_profiles_v2_updated_at
  BEFORE UPDATE ON contact_profiles_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
