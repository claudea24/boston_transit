-- Live Transit + Weather Dashboard schema
-- Run this in the Supabase SQL editor for project rybxmctxshbbqoaqbttj

create extension if not exists pgcrypto;

create table if not exists public.weather_data (
  id uuid primary key default gen_random_uuid(),
  location_key text unique not null,
  latitude float8 not null,
  longitude float8 not null,
  current_data jsonb not null,
  hourly_data jsonb not null,
  daily_data jsonb not null,
  timezone text not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.weather_data enable row level security;

drop policy if exists "Public can read weather data" on public.weather_data;
create policy "Public can read weather data"
  on public.weather_data for select
  using (true);

create table if not exists public.vehicle_positions (
  id text primary key,
  route_id text not null,
  trip_id text,
  route_label text not null,
  route_color text not null default '#3b82f6',
  mode text not null check (mode in ('bus', 'train', 'tram')),
  latitude float8 not null,
  longitude float8 not null,
  bearing float8 not null default 0,
  speed_kph float8 not null default 0,
  delay_seconds int4 not null default 0,
  location_key text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_vehicle_positions_location_key
  on public.vehicle_positions (location_key, updated_at desc);

alter table public.vehicle_positions enable row level security;

drop policy if exists "Public can read vehicle positions" on public.vehicle_positions;
create policy "Public can read vehicle positions"
  on public.vehicle_positions for select
  using (true);

create table if not exists public.saved_locations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  latitude float8 not null,
  longitude float8 not null,
  country text not null default '',
  is_default boolean not null default false,
  display_order int4 not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_saved_locations_user
  on public.saved_locations (user_id, display_order);

alter table public.saved_locations enable row level security;

drop policy if exists "Users manage own locations" on public.saved_locations;
create policy "Users manage own locations"
  on public.saved_locations for all
  using (((select auth.jwt()->>'sub') = user_id))
  with check (((select auth.jwt()->>'sub') = user_id));

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id text unique not null,
  temp_unit text not null default 'fahrenheit',
  wind_unit text not null default 'mph',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users manage own preferences" on public.user_preferences;
create policy "Users manage own preferences"
  on public.user_preferences for all
  using (((select auth.jwt()->>'sub') = user_id))
  with check (((select auth.jwt()->>'sub') = user_id));

alter publication supabase_realtime add table public.weather_data;
alter publication supabase_realtime add table public.vehicle_positions;
