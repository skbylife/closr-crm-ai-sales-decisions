-- Standalone, single-user local preview schema. Apply only to a fresh local PG17 stack.
-- No prompts, Engine rules, customer records, or production schema are copied here.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.org_memberships (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role = 'owner'),
  team_id uuid,
  job_level integer NOT NULL DEFAULT 2 CHECK (job_level = 2),
  role_level integer NOT NULL DEFAULT 2 CHECK (role_level = 2),
  CONSTRAINT community_one_member_per_org UNIQUE (org_id)
);

CREATE TABLE IF NOT EXISTS public.accounts (
  id text PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'private',
  CONSTRAINT community_accounts_scope UNIQUE (id, org_id)
);

CREATE TABLE IF NOT EXISTS public.opportunities (
  id text PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  name text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT community_opportunity_account_scope
    FOREIGN KEY (account_id, org_id) REFERENCES public.accounts(id, org_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.strategic_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  opportunity_id text,
  goal_type text NOT NULL DEFAULT 'custom',
  goal_description text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  alternative_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(5,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  ai_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_play_account_scope
    FOREIGN KEY (account_id, org_id) REFERENCES public.accounts(id, org_id) ON DELETE CASCADE
);

-- Browser clients have no table policies. Only reviewed server routes use the
-- service role, after getUser() and explicit org/account checks.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategic_plays ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organizations, public.org_memberships, public.accounts,
  public.opportunities, public.strategic_plays FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations, public.org_memberships,
  public.accounts, public.opportunities, public.strategic_plays TO service_role;

CREATE OR REPLACE FUNCTION public.community_preview_first_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE preview_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
BEGIN
  INSERT INTO public.organizations(id, name) VALUES (preview_org, 'Closr Community Preview')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.org_memberships(org_id, user_id)
    VALUES (preview_org, NEW.id) ON CONFLICT DO NOTHING;
  IF EXISTS (SELECT 1 FROM public.org_memberships WHERE user_id = NEW.id AND org_id = preview_org) THEN
    INSERT INTO public.accounts(id, org_id, name, owner_id, user_id)
      VALUES ('preview-first-account', preview_org, '示例客户', NEW.id, NEW.id)
      ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.community_preview_first_user() FROM PUBLIC;
DROP TRIGGER IF EXISTS community_preview_first_user ON auth.users;
CREATE TRIGGER community_preview_first_user AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.community_preview_first_user();
