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
  created_at timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "Users manage their own profile" on profiles;
create policy "Users manage their own profile"
  on profiles
  for all
  using (auth.uid() = id)
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
