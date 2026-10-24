-- Native application identity: no GoTrue/Supabase service required.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL,
 encrypted_password text NOT NULL,
 raw_user_meta_data jsonb NOT NULL DEFAULT '{}',
 raw_app_meta_data jsonb NOT NULL DEFAULT '{}',
 email_confirmed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 last_sign_in_at timestamptz,
 banned_until timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS native_users_email_ci ON auth.users(lower(email));
CREATE TABLE IF NOT EXISTS auth.native_sessions (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 aal smallint NOT NULL DEFAULT 1 CHECK (aal IN (1,2)),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS native_sessions_user ON auth.native_sessions(user_id);
CREATE TABLE IF NOT EXISTS auth.native_mfa (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 secret_ciphertext text NOT NULL,
 friendly_name text NOT NULL DEFAULT 'Closr',
 status text NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','verified')),
 last_counter bigint,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS native_mfa_verified_user ON auth.native_mfa(user_id) WHERE status='verified';
CREATE TABLE IF NOT EXISTS auth.native_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 factor_id uuid NOT NULL REFERENCES auth.native_mfa(id) ON DELETE CASCADE,
 session_hash text NOT NULL REFERENCES auth.native_sessions(token_hash) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
 attempts integer NOT NULL DEFAULT 0,
 consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS auth.native_recovery (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS auth.native_rate_limits (
 key_hash text PRIMARY KEY,
 window_start timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 1
);
REVOKE ALL ON ALL TABLES IN SCHEMA auth FROM PUBLIC;
-- Database roles are managed by the application baseline. Never grant these tables
-- to the browser/data role; auth operations run exclusively in server code.
