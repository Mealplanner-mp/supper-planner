-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).
-- Safe to re-run: table creation is guarded with IF NOT EXISTS, and policies
-- are dropped and recreated so this won't error if you've already run part of it.

-- ---------------------------------------------------------------------------
-- profiles — one row per user
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  status text not null default 'active', -- 'active' | 'suspended'
  beta_cohort text,                      -- e.g. 'beta-1', for your own tracking
  is_paid boolean not null default false, -- flip to true yourself once payment is confirmed
  tier text,                             -- 'basic' | 'pro' | null (null = grandfathered/full access once is_paid)
  email text,                            -- mirrors auth.users.email so the Stripe webhook can match by email
  stripe_customer_id text,               -- set by stripe-webhook/verify-checkout; used for the billing portal
  trial_reminder_sent boolean not null default false, -- "your trial ends soon" email, sent once
  winback_sent boolean not null default false,        -- "we miss you" email, sent once after trial expiry
  created_at timestamptz default now()   -- also doubles as the free-trial start date
);

alter table profiles add column if not exists is_paid boolean not null default false;
alter table profiles add column if not exists tier text;
alter table profiles add column if not exists email text;
alter table profiles add column if not exists stripe_customer_id text;
alter table profiles add column if not exists trial_reminder_sent boolean not null default false;
alter table profiles add column if not exists winback_sent boolean not null default false;

alter table profiles enable row level security;

-- A signed-in user can read and create their own row. They can also UPDATE
-- their own row (for the account page — username/email), but see the column
-- grant below: is_paid / tier / stripe_customer_id stay off-limits to them
-- even though the row itself is editable. Only you (dashboard) or the
-- Stripe webhook / verify-checkout functions (service role, bypasses RLS
-- and grants entirely) can touch those.
drop policy if exists "Users manage their own profile" on profiles;
drop policy if exists "Users can view their own profile" on profiles;
create policy "Users can view their own profile"
  on profiles
  for select
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on profiles;
create policy "Users can insert their own profile"
  on profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own basic info" on profiles;
create policy "Users can update their own basic info"
  on profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Column-level lockdown: the RLS policy above only decides which ROW a user
-- may touch. Without this, the authenticated role's normal table-level
-- UPDATE privilege would still let someone set is_paid/tier/stripe_customer_id
-- on their own row via a raw API call (e.g. from browser devtools), bypassing
-- whatever the UI shows. Explicitly cap UPDATE to just the columns a user
-- should be able to change themselves.
revoke update on profiles from authenticated;
grant update (username, email) on profiles to authenticated;

-- service_role (used by stripe-webhook, verify-checkout, billing-portal) bypasses
-- RLS entirely, but RLS bypass and table-level GRANTs are separate things — it
-- still needs its own explicit privileges to touch this table at all. Tables
-- created via raw SQL (as opposed to the Table Editor UI) don't automatically
-- get this, so without it every service-role update to is_paid/tier/
-- stripe_customer_id fails with "permission denied for table profiles".
grant select, update on profiles to service_role;

-- ---------------------------------------------------------------------------
-- ai_usage — daily per-user request count, so the ai-assistant function can
-- cap usage and one person can't run up the Anthropic bill by spamming it.
-- Only ever touched by ai-assistant (service role) — no client access.
-- ---------------------------------------------------------------------------
create table if not exists ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  count int not null default 0,
  primary key (user_id, usage_date)
);

alter table ai_usage enable row level security;
-- Deliberately no policies for anon/authenticated — RLS with zero permissive
-- policies denies all client access by default. service_role bypasses RLS,
-- but (as with profiles above) still needs its own explicit table grant.
grant select, insert, update on ai_usage to service_role;

-- ---------------------------------------------------------------------------
-- planner_data — one row per user, holds everything the app used to keep
-- in window.storage
-- ---------------------------------------------------------------------------
create table if not exists planner_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recipes jsonb default '[]',
  settings jsonb default '{}',
  plan jsonb,
  usage_history jsonb default '{}',
  freezer_stock jsonb default '{}',
  grocery_checked jsonb default '{}',
  manual_meals jsonb default '{}',
  updated_at timestamptz default now()
);

alter table planner_data add column if not exists manual_meals jsonb default '{}';

alter table planner_data enable row level security;

drop policy if exists "Users manage their own planner" on planner_data;
create policy "Users manage their own planner"
  on planner_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
