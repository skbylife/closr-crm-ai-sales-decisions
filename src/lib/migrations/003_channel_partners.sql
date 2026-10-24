-- Migration 003: Channel Partners & Deal Registrations
-- 渠道管理：合作伙伴 + Deal 报备

-- 16. Channel Partners (渠道合作伙伴)
create table if not exists channel_partners (
  id text primary key,
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  type text not null,          -- 'reseller' | 'distributor' | 'var' | 'si' | 'referral'
  tier text default 'registered',  -- 'gold' | 'silver' | 'bronze' | 'registered'
  region text,
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  deal_count integer default 0,
  total_revenue numeric default 0,
  active_deals integer default 0,
  win_rate numeric default 0,
  commission_rate numeric default 10,
  contract_expiry text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 17. Deal Registrations (渠道报备)
create table if not exists deal_registrations (
  id text primary key,
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  partner_id text references channel_partners(id) on delete cascade,
  partner_name text,
  account_name text not null,
  deal_value numeric default 0,
  status text default 'pending',  -- 'pending' | 'approved' | 'expired' | 'rejected'
  submitted_at timestamptz default now(),
  expires_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_channel_partners_org_id on channel_partners(org_id);
create index if not exists idx_deal_registrations_org_id on deal_registrations(org_id);
create index if not exists idx_deal_registrations_partner_id on deal_registrations(partner_id);

-- RLS
alter table channel_partners enable row level security;
alter table deal_registrations enable row level security;

create policy "channel_partners_rls" on channel_partners for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

create policy "deal_registrations_rls" on deal_registrations for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );
