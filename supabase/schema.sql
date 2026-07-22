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
  created_at timestamptz default now()   -- also doubles as the free-trial start date
);

alter table profiles add column if not exists is_paid boolean not null default false;
alter table profiles add column if not exists tier text;
alter table profiles add column if not exists email text;

alter table profiles enable row level security;

-- Deliberately SELECT + INSERT only, no UPDATE — a signed-in user can read and
-- create their own row, but can never edit is_paid (or anything else) on it
-- themselves. Only you, via the Supabase dashboard, can flip is_paid to true.
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
  updated_at timestamptz default now()
);

alter table planner_data enable row level security;

drop policy if exists "Users manage their own planner" on planner_data;
create policy "Users manage their own planner"
  on planner_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
