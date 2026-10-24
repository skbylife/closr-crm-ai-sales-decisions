-- AI invocation observability v1
-- Additive table for model-call cost/debug visibility. Stores metadata only;
-- never persist prompts, completions, or sensitive payloads.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_invocation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NULL REFERENCES organizations(id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  account_id text NULL,
  opportunity_id text NULL,
  route text NULL,
  use_case text NULL,
  tier text NULL,
  model text NULL,
  provider text NULL,
  status text NOT NULL CHECK (status IN ('success', 'error', 'degraded')),
  prompt_tokens integer NULL CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  completion_tokens integer NULL CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
  total_tokens integer NULL CHECK (total_tokens IS NULL OR total_tokens >= 0),
  duration_ms integer NULL CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_message text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_invocation_logs_org_created
  ON ai_invocation_logs (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_invocation_logs_user_created
  ON ai_invocation_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_invocation_logs_route_created
  ON ai_invocation_logs (route, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_invocation_logs_status_created
  ON ai_invocation_logs (status, created_at DESC);

ALTER TABLE ai_invocation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_invocation_logs_org_select" ON ai_invocation_logs;
CREATE POLICY "ai_invocation_logs_org_select" ON ai_invocation_logs
  FOR SELECT
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM org_memberships m
      WHERE m.org_id = ai_invocation_logs.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "ai_invocation_logs_service_role_all" ON ai_invocation_logs;
CREATE POLICY "ai_invocation_logs_service_role_all" ON ai_invocation_logs
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMIT;
