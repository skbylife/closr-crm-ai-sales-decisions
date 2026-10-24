ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS competitors jsonb DEFAULT '[]'::jsonb;
