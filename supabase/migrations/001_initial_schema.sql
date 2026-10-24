-- 001_initial_schema.sql
-- Organizations, teams, memberships, and invitations tables.
-- Idempotent: safe to re-run.

-- 0a. Organizations
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  logo_url text,
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 0b. Teams
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

-- 0c. Organization Memberships
create table if not exists org_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  org_id uuid references organizations(id) on delete cascade not null,
  team_id uuid references teams(id) on delete set null,
  role text not null check (role in ('owner', 'admin', 'manager', 'member')),
  display_name text,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz default now(),
  unique(user_id, org_id)
);

-- 0d. Invitations
create table if not exists org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'member')),
  token text unique not null,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz default now()
);
