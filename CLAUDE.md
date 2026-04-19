# Weather Dashboard

A weather app inspired by Apple Weather — check current conditions, hourly and daily forecasts, precipitation, wind, and more for any location. Built as a monorepo with a background worker that polls Open-Meteo and writes to Supabase, and a Next.js frontend that reads from Supabase with real-time subscriptions for live updates without page refresh.

**GitHub**: TBD
**Live URL (frontend)**: TBD (Vercel)
**Live URL (worker)**: TBD (Railway)
**Supabase project ref**: TBD

## Architecture Overview

```
┌─────────────────┐       poll every 5 min       ┌─────────────────┐
│   Open-Meteo    │ ◄──────────────────────────── │     Worker      │
│   (free API)    │ ──────── weather data ──────► │  (Railway)      │
└─────────────────┘                               └────────┬────────┘
                                                           │ write
                                                           ▼
                                                  ┌─────────────────┐
                                                  │    Supabase     │
                                                  │  (PostgreSQL +  │
                                                  │   Realtime)     │
                                                  └────────┬────────┘
                                                           │ realtime subscription
                                                           ▼
┌─────────────────┐       read + subscribe        ┌─────────────────┐
│     User        │ ◄──────────────────────────── │    Frontend     │
│   (browser)     │ ──────── save locations ─────►│  (Vercel)       │
└─────────────────┘                               └─────────────────┘
```

### System Components

| Component | What it is | Where it runs | Responsibility |
|---|---|---|---|
| **Frontend** | Next.js 16 App Router | Vercel | UI, auth, location management, reads weather from Supabase, Realtime subscriptions |
| **Worker** | Node.js long-running process | Railway | Polls Open-Meteo on a schedule, transforms responses, writes to Supabase |
| **Supabase** | PostgreSQL + Realtime + RLS | Supabase Cloud | Source of truth for all data. Pushes changes to subscribed frontends via WebSocket |
| **Open-Meteo** | External weather API | Third-party | Provides current, hourly, and daily weather forecasts. Free, no key required |
| **Clerk** | Auth provider | Clerk Cloud | Handles sign-up/sign-in, issues JWTs that Supabase validates for RLS |

### Data Flow: Source to Screen (step by step)

```
Step 1: User saves a location
──────────────────────────────
Browser → Clerk JWT → Supabase RLS → INSERT into saved_locations
                                       (user_id, name, lat, lon, country)

Step 2: Worker discovers the location
──────────────────────────────────────
Worker (every 5 min) → Supabase service role → SELECT DISTINCT lat, lon
                                                 FROM saved_locations
                        ← returns list of all unique locations across all users

Step 3: Worker fetches weather
──────────────────────────────
Worker → HTTP GET → Open-Meteo API
  ?latitude=41.88&longitude=-87.63
  &current=temperature_2m,apparent_temperature,weather_code,...
  &hourly=temperature_2m,precipitation_probability,...
  &daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,...
  &forecast_days=10&timezone=auto
                  ← returns JSON with current, hourly[], daily[]

Step 4: Worker transforms and writes
─────────────────────────────────────
Worker → transforms Open-Meteo response → normalized CurrentWeather,
         HourlyForecast[], DailyForecast[] objects
       → Supabase service role → UPSERT into weather_data
         (location_key="41.88,-87.63", current_data=jsonb, hourly_data=jsonb,
          daily_data=jsonb, fetched_at=now())
         ON CONFLICT (location_key) DO UPDATE

Step 5: Supabase Realtime pushes update
───────────────────────────────────────
Supabase detects UPDATE on weather_data row
  → pushes postgres_changes event over WebSocket
  → to all frontend clients subscribed to that location_key

Step 6: Frontend receives and renders
──────────────────────────────────────
Browser WebSocket ← receives payload.new (updated weather_data row)
  → WeatherContext updates state
  → React re-renders: CurrentConditions, HourlyForecast, DailyForecast,
    WindCard, PrecipitationCard, etc.
  → User sees fresh data — no page refresh needed

Step 7: Initial page load (no Realtime yet)
────────────────────────────────────────────
Browser → page load → WeatherContext mounts
  → SELECT from weather_data WHERE location_key = user's default location
  → render immediately with cached data from last worker poll
  → simultaneously open Realtime subscription for live updates going forward
```

### What happens when...

| Scenario | What happens |
|---|---|
| **New user signs up** | They have no saved locations yet. Frontend prompts to search and add a city. Worker picks it up on next poll cycle (within 5 min). |
| **User adds a new location** | Frontend inserts into `saved_locations`. Worker discovers it on next poll and fetches weather. First Realtime update arrives within ~5 min. For instant feedback, frontend can also do a one-time direct fetch via `/api/weather` fallback. |
| **Worker is down** | Frontend still works — it reads the last cached data from `weather_data`. `fetched_at` timestamp shows staleness. No Realtime updates until worker restarts. |
| **Two users save same city** | Worker deduplicates — queries `SELECT DISTINCT lat, lon` so it only fetches once per unique location. Both users' Realtime subscriptions receive the same update. |
| **User opens app after hours** | Frontend loads cached `weather_data` instantly. If worker has been polling, data is fresh. Realtime subscription catches any updates that arrive while they're on the page. |

## Tech Stack

- **Monorepo** — Turborepo with `apps/web/` (frontend) and `apps/worker/` (background poller)
- **Next.js 16** (App Router) with TypeScript — frontend in `apps/web/`
- **Tailwind CSS v4** — dark theme with translucent cards, blur backdrops, sky-tone gradients
- **Node.js worker** with TypeScript — background poller in `apps/worker/`
- **Clerk** for authentication (email sign-up/sign-in)
- **Supabase** for data storage (PostgreSQL + RLS + Realtime)
  - Worker writes weather data using service role key
  - Frontend reads via Clerk-authenticated client with RLS
  - Realtime subscriptions push live updates to the UI
- **Open-Meteo API** for weather data (free, no key required)
- **Open-Meteo Geocoding API** for city/location search (free, no key required)
- **React Context** for client-side state

## Monorepo Structure

```
weather/
├── apps/
│   ├── web/                              # Next.js frontend (deployed to Vercel)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx            # Root layout (ClerkProvider + Providers)
│   │   │   │   ├── page.tsx              # Weather dashboard (main view)
│   │   │   │   ├── globals.css           # Tailwind + dark theme + gradients
│   │   │   │   ├── api/
│   │   │   │   │   └── search/route.ts   # Open-Meteo geocoding proxy
│   │   │   │   ├── search/page.tsx       # City search page
│   │   │   │   ├── sign-in/[[...sign-in]]/
│   │   │   │   └── sign-up/[[...sign-up]]/
│   │   │   ├── components/
│   │   │   │   ├── weather/
│   │   │   │   │   ├── CurrentConditions.tsx
│   │   │   │   │   ├── HourlyForecast.tsx
│   │   │   │   │   ├── DailyForecast.tsx
│   │   │   │   │   ├── PrecipitationCard.tsx
│   │   │   │   │   ├── WindCard.tsx
│   │   │   │   │   ├── UVIndexCard.tsx
│   │   │   │   │   ├── HumidityCard.tsx
│   │   │   │   │   ├── VisibilityCard.tsx
│   │   │   │   │   ├── PressureCard.tsx
│   │   │   │   │   ├── SunriseSunsetCard.tsx
│   │   │   │   │   └── WeatherIcon.tsx
│   │   │   │   ├── location/
│   │   │   │   │   ├── LocationSearch.tsx
│   │   │   │   │   ├── LocationList.tsx
│   │   │   │   │   └── LocationCard.tsx
│   │   │   │   ├── shared/
│   │   │   │   │   └── LoadingSpinner.tsx
│   │   │   │   ├── Navbar.tsx
│   │   │   │   └── ClientProviders.tsx
│   │   │   ├── context/
│   │   │   │   ├── WeatherContext.tsx
│   │   │   │   └── LocationContext.tsx
│   │   │   ├── lib/
│   │   │   │   ├── types.ts
│   │   │   │   ├── supabase.ts           # Supabase client (Clerk integration)
│   │   │   │   ├── geocoding.ts
│   │   │   │   ├── weatherCodes.ts
│   │   │   │   └── mappers/
│   │   │   │       └── location.ts
│   │   │   └── middleware.ts             # Clerk route protection
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   └── tsconfig.json
│   │
│   └── worker/                           # Background worker (deployed to Railway)
│       ├── src/
│       │   ├── index.ts                  # Entry point — starts polling loop
│       │   ├── poller.ts                 # Fetches weather from Open-Meteo for all tracked locations
│       │   ├── supabase.ts              # Supabase client (service role key)
│       │   └── types.ts                 # Shared types (or import from packages/)
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                           # Shared types and utilities
│       ├── src/
│       │   ├── types.ts                  # TypeScript interfaces shared across apps
│       │   └── weatherCodes.ts          # WMO code → description/icon mapping
│       ├── package.json
│       └── tsconfig.json
│
├── turbo.json                            # Turborepo pipeline config
├── package.json                          # Root package.json (workspaces)
├── .gitignore
└── CLAUDE.md                             # This file
```

## Core Features

### 1. Current Conditions
- Current temperature (large, prominent display)
- Feels like temperature
- Weather condition with icon (sunny, cloudy, rainy, snowy, etc.)
- Today's high and low temperatures
- Location name and current time

### 2. Hourly Forecast
- Horizontally scrollable row showing next 24 hours
- Each hour shows: time, weather icon, temperature
- Highlight current hour
- Precipitation probability bars when rain/snow expected

### 3. 10-Day Daily Forecast
- Vertical list of next 10 days
- Each row: day name, weather icon, low temp, temperature range bar, high temp
- Temperature bar shows relative range (like Apple Weather's colored bar)
- Precipitation probability percentage when > 0%

### 4. Precipitation
- Probability percentage for current conditions
- "Rain expected in X hours" or "No rain expected today" summary
- Precipitation amount (mm) in hourly view

### 5. Wind
- Current wind speed (mph or km/h based on user preference)
- Wind direction (compass + arrow indicator)
- Wind gusts

### 6. Additional Detail Cards
- **UV Index** — numeric value + category (Low/Moderate/High/Very High/Extreme)
- **Humidity** — percentage with dew point
- **Visibility** — distance in miles/km
- **Pressure** — hPa with trend arrow (rising/falling/steady)
- **Sunrise & Sunset** — times with visual arc

### 7. Location Management (Personalization)
- Browser geolocation for current location (with permission prompt)
- City search with autocomplete (Open-Meteo Geocoding API)
- Save favorite locations (stored in Supabase, worker auto-polls them)
- Swipe/tab between saved locations
- Default to last viewed location
- Unit preferences: °F/°C, mph/km/h

### 8. Live Updates (Supabase Realtime)
- Frontend subscribes to `weather_data` table changes via Supabase Realtime
- When worker writes fresh data, UI updates automatically — no page refresh
- Visual indicator showing "Last updated: X minutes ago"
- Realtime channel filtered by user's saved location IDs

## Pages

| Route | Description |
|---|---|
| `/` | **Weather Dashboard** — main weather view for selected location, live-updating |
| `/search` | **Search** — city search with autocomplete results |
| `/sign-in`, `/sign-up` | Clerk authentication |

## Authentication (Clerk)

- All routes protected by Clerk middleware — unauthenticated users redirect to `/sign-in`
- `ClerkProvider` wraps the app in `layout.tsx`
- Supabase client uses Clerk's native integration with `accessToken()` callback
- RLS policies use `auth.jwt()->>'sub'` for user scoping
- Classmates can sign up with any email address

## Database (Supabase)

### Tables Overview

```
┌──────────────────────┐         ┌──────────────────────┐
│   saved_locations     │         │   user_preferences    │
│   (per user)          │         │   (per user)          │
│                       │         │                       │
│ user_id (Clerk)       │         │ user_id (Clerk)       │
│ name, lat, lon        │         │ temp_unit, wind_unit  │
│ country, is_default   │         └──────────────────────┘
│ display_order         │
└───────────┬──────────┘
            │ Worker reads DISTINCT lat,lon
            │ to know what to poll
            ▼
┌──────────────────────┐
│   weather_data        │
│   (per location)      │
│                       │
│ location_key (unique) │ ◄── Worker upserts every 5 min
│ current_data (jsonb)  │ ──► Frontend reads + Realtime subscribes
│ hourly_data (jsonb)   │
│ daily_data (jsonb)    │
│ fetched_at            │
└──────────────────────┘
```

| Table | Purpose | Written by | Read by | Rows |
|---|---|---|---|---|
| `weather_data` | Current + hourly + daily forecast per location | Worker (service role) | Frontend (authenticated) | 1 row per unique lat/lon |
| `saved_locations` | User's favorite locations | Frontend (authenticated) | Frontend + Worker | Many rows per user |
| `user_preferences` | Display unit preferences | Frontend (authenticated) | Frontend | 1 row per user |

### `weather_data` Table
The central table. One row per unique location (deduplicated across all users). Worker overwrites the entire row every 5 minutes. JSONB columns store structured weather data that the frontend parses client-side.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key (default `gen_random_uuid()`) |
| `location_key` | text | **Unique.** Format: `{lat},{lon}` rounded to 2 decimals (e.g., `41.88,-87.63`). Used for upsert and Realtime filtering. |
| `latitude` | float8 | Location latitude |
| `longitude` | float8 | Location longitude |
| `current_data` | jsonb | Current conditions: `{ temperature, feelsLike, weatherCode, humidity, precipitation, windSpeed, windDirection, windGusts, pressure, uvIndex }` |
| `hourly_data` | jsonb | Array of next 48 hours: `[{ time, temperature, precipitationProbability, precipitation, weatherCode, windSpeed, visibility, uvIndex }, ...]` |
| `daily_data` | jsonb | Array of next 10 days: `[{ date, weatherCode, tempMax, tempMin, feelsLikeMax, feelsLikeMin, sunrise, sunset, precipitationSum, precipitationProbabilityMax, windSpeedMax, windGustsMax, uvIndexMax }, ...]` |
| `timezone` | text | IANA timezone (e.g., `America/Chicago`) — used by frontend for local time display |
| `fetched_at` | timestamptz | When the worker last fetched this data — frontend shows "Updated X min ago" |
| `created_at` | timestamptz | Row creation time (default `now()`) |

**Why JSONB?** Storing weather as JSONB avoids needing 48 hourly rows + 10 daily rows per location per poll. One row, one upsert, one Realtime event. Frontend parses the JSON client-side.

### `saved_locations` Table
User-facing. Each user can save multiple cities. Worker reads all rows (via service role) to build its poll list.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key (default `gen_random_uuid()`) |
| `user_id` | text | Clerk user ID (from `auth.jwt()->>'sub'`) |
| `name` | text | City/location display name (e.g., "Chicago, Illinois") |
| `latitude` | float8 | Location latitude |
| `longitude` | float8 | Location longitude |
| `country` | text | Country name (e.g., "United States") |
| `is_default` | boolean | User's primary location (shown on app open). One per user. |
| `display_order` | int4 | Position in user's location list (for drag-to-reorder) |
| `created_at` | timestamptz | Row creation time (default `now()`) |

### `user_preferences` Table
One row per user. Stores display settings — the worker always stores data in Fahrenheit/mph, and the frontend converts client-side based on these preferences.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key (default `gen_random_uuid()`) |
| `user_id` | text | Clerk user ID (unique — one row per user) |
| `temp_unit` | text | `fahrenheit` or `celsius` (default: `fahrenheit`) |
| `wind_unit` | text | `mph` or `kmh` (default: `mph`) |
| `created_at` | timestamptz | Row creation time (default `now()`) |
| `updated_at` | timestamptz | Last update time |

### Full SQL Schema

```sql
-- 1. weather_data: worker writes, frontend reads
create table public.weather_data (
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

create policy "Authenticated users can read weather data"
  on public.weather_data for select to authenticated
  using (true);

-- Enable Realtime (also toggle in Dashboard: Database → Tables → weather_data → Enable Realtime)
alter publication supabase_realtime add table public.weather_data;

-- 2. saved_locations: frontend writes, both read
create table public.saved_locations (
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

alter table public.saved_locations enable row level security;

create policy "Users manage own locations"
  on public.saved_locations for all to authenticated
  using (((select auth.jwt()->>'sub') = (user_id)::text));

-- Index for worker's DISTINCT query
create index idx_saved_locations_coords
  on public.saved_locations (latitude, longitude);

-- 3. user_preferences: frontend reads and writes
create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id text unique not null,
  temp_unit text not null default 'fahrenheit',
  wind_unit text not null default 'mph',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "Users manage own preferences"
  on public.user_preferences for all to authenticated
  using (((select auth.jwt()->>'sub') = (user_id)::text));
```

### Realtime Configuration
Enable Realtime on the `weather_data` table:
- **SQL**: `alter publication supabase_realtime add table public.weather_data;` (included above)
- **Dashboard**: Database → Tables → `weather_data` → toggle Realtime on
- Only `weather_data` needs Realtime — `saved_locations` and `user_preferences` are read on page load and updated optimistically

### How Frontend Joins the Data

The frontend doesn't use SQL joins. It reads from two tables independently:

1. **On auth load**: Fetch user's `saved_locations` + `user_preferences`
2. **On location select**: Build `location_key` from lat/lon → query `weather_data` WHERE `location_key` matches
3. **Subscribe**: Open Realtime channel filtered to the user's saved `location_key` values
4. **On Realtime event**: Update local weather state → React re-renders all weather components

### Column Name Mapping
Database uses snake_case, TypeScript uses camelCase. Mappers in `apps/web/src/lib/mappers/`.

## Worker (`apps/worker/`)

### What the Worker Does

The worker is a **long-running Node.js process** deployed on Railway. It runs continuously (not serverless, not cron) and acts as the bridge between Open-Meteo and Supabase. The frontend never calls Open-Meteo directly — all weather data flows through the worker.

### Poll Cycle (every 5 minutes)

```
┌─ Poll Cycle Start ──────────────────────────────────────────────────┐
│                                                                      │
│  1. QUERY saved_locations                                            │
│     SELECT DISTINCT latitude, longitude FROM saved_locations         │
│     → deduplicated list (e.g., 15 users saved Chicago = 1 fetch)    │
│                                                                      │
│  2. FETCH weather for each unique location                           │
│     GET https://api.open-meteo.com/v1/forecast                      │
│       ?latitude=41.88&longitude=-87.63                               │
│       &current=temperature_2m,apparent_temperature,...               │
│       &hourly=temperature_2m,precipitation_probability,...           │
│       &daily=temperature_2m_max,temperature_2m_min,...               │
│       &forecast_days=10&timezone=auto                                │
│     → batch with small delay between requests to be polite           │
│                                                                      │
│  3. TRANSFORM Open-Meteo response                                    │
│     - Raw API arrays → structured CurrentWeather object              │
│     - Raw hourly arrays → HourlyForecast[] (next 48 hours)          │
│     - Raw daily arrays → DailyForecast[] (next 10 days)             │
│     - Compute location_key as "{lat},{lon}" rounded to 2 decimals   │
│                                                                      │
│  4. UPSERT into weather_data                                         │
│     INSERT INTO weather_data (location_key, latitude, longitude,     │
│       current_data, hourly_data, daily_data, timezone, fetched_at)   │
│     VALUES (...)                                                     │
│     ON CONFLICT (location_key) DO UPDATE SET                         │
│       current_data = EXCLUDED.current_data,                          │
│       hourly_data = EXCLUDED.hourly_data,                            │
│       daily_data = EXCLUDED.daily_data,                              │
│       fetched_at = now()                                             │
│     → Supabase Realtime fires postgres_changes to all subscribers    │
│                                                                      │
│  5. LOG cycle results                                                │
│     "Poll complete: 12 locations fetched in 3.2s, 0 errors"         │
│                                                                      │
│  6. SLEEP 5 minutes, then repeat                                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Worker Files

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point. Starts the poll loop, handles graceful shutdown (SIGTERM/SIGINT). |
| `src/poller.ts` | Core logic: query locations, fetch Open-Meteo, transform response, upsert to Supabase. |
| `src/supabase.ts` | Supabase client initialized with service role key. Exports query helpers. |
| `src/types.ts` | Imports shared types from `packages/shared/` or defines worker-specific types. |

### Worker Supabase Client
Uses **service role key** (bypasses RLS) since it needs to:
- Read all `saved_locations` across all users (RLS would scope to a single user)
- Write to `weather_data` table (RLS only grants `select` to authenticated users)

### Error Handling
- If Open-Meteo returns an error for one location, log it and continue to the next — don't fail the whole cycle
- If Supabase is unreachable, log the error and retry on the next cycle
- On startup, if no saved locations exist yet, log "No locations to poll" and sleep until next cycle
- Graceful shutdown: catch SIGTERM (Railway sends this on redeploy) and finish the current cycle before exiting

## State Management (React Context)

| Context | File | Scope |
|---|---|---|
| `WeatherContext` | `apps/web/src/context/WeatherContext.tsx` | Current weather data, Supabase Realtime subscription, selected location |
| `LocationContext` | `apps/web/src/context/LocationContext.tsx` | Saved locations list, user preferences (loads on auth) |

### Realtime Subscription Pattern
```typescript
// In WeatherContext — subscribe to weather_data changes for user's saved locations
const channel = supabase
  .channel('weather-updates')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'weather_data',
    filter: `location_key=in.(${locationKeys.join(',')})`,
  }, (payload) => {
    // Update local state with new weather data
    updateWeatherFromRealtime(payload.new);
  })
  .subscribe();
```

## External APIs

### Open-Meteo Forecast API (called by Worker)
- **Base URL**: `https://api.open-meteo.com/v1/forecast`
- **Key parameters**:
  - `latitude`, `longitude` — location coordinates
  - `current` — `temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,uv_index`
  - `hourly` — `temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,visibility,uv_index`
  - `daily` — `weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max`
  - `temperature_unit` — `fahrenheit` (stored in both; frontend converts per user preference)
  - `wind_speed_unit` — `mph` (stored in both; frontend converts per user preference)
  - `forecast_days` — `10`
  - `timezone` — `auto`
- **Rate limit**: generous, no key needed

### Open-Meteo Geocoding API (called by Frontend)
- **Base URL**: `https://geocoding-api.open-meteo.com/v1/search`
- **Key parameters**:
  - `name` — search query (city name)
  - `count` — number of results (default 5)
  - `language` — `en`
- **Returns**: city name, country, latitude, longitude, timezone

### WMO Weather Codes
Open-Meteo returns WMO weather codes. Map these to icons and descriptions:

| Code | Description | Icon |
|---|---|---|
| 0 | Clear sky | ☀️ |
| 1, 2, 3 | Mainly clear, partly cloudy, overcast | 🌤️ ⛅ ☁️ |
| 45, 48 | Fog | 🌫️ |
| 51, 53, 55 | Drizzle (light, moderate, dense) | 🌦️ |
| 61, 63, 65 | Rain (slight, moderate, heavy) | 🌧️ |
| 71, 73, 75 | Snow (slight, moderate, heavy) | 🌨️ |
| 80, 81, 82 | Rain showers | 🌧️ |
| 85, 86 | Snow showers | 🌨️ |
| 95, 96, 99 | Thunderstorm | ⛈️ |

## Data Model (TypeScript — `packages/shared/`)

```typescript
// Current weather conditions
interface CurrentWeather {
  temperature: number;
  feelsLike: number;
  weatherCode: number;
  humidity: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  pressure: number;
  uvIndex: number;
}

// Single hour forecast
interface HourlyForecast {
  time: string;           // ISO 8601
  temperature: number;
  precipitationProbability: number;
  precipitation: number;
  weatherCode: number;
  windSpeed: number;
  visibility: number;
  uvIndex: number;
}

// Single day forecast
interface DailyForecast {
  date: string;           // YYYY-MM-DD
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  feelsLikeMax: number;
  feelsLikeMin: number;
  sunrise: string;
  sunset: string;
  precipitationSum: number;
  precipitationProbabilityMax: number;
  windSpeedMax: number;
  windGustsMax: number;
  uvIndexMax: number;
}

// Full weather data (stored in Supabase weather_data.current_data / hourly_data / daily_data)
interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  timezone: string;
}

// Saved location
interface SavedLocation {
  id: string;
  userId: string;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  isDefault: boolean;
  displayOrder: number;
  createdAt: string;
}

// User preferences
interface UserPreferences {
  id: string;
  userId: string;
  tempUnit: 'fahrenheit' | 'celsius';
  windUnit: 'mph' | 'kmh';
}

// Geocoding search result
interface GeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;        // State/province
  timezone: string;
}

// Supabase weather_data row
interface WeatherDataRow {
  id: string;
  location_key: string;
  latitude: number;
  longitude: number;
  current_data: CurrentWeather;
  hourly_data: HourlyForecast[];
  daily_data: DailyForecast[];
  timezone: string;
  fetched_at: string;
  created_at: string;
}
```

## API Routes (Frontend — `apps/web/`)

| Route | Purpose |
|---|---|
| `/api/search` | Proxies Open-Meteo Geocoding API for city search |

Note: No `/api/weather` route needed — frontend reads weather data directly from Supabase instead of calling Open-Meteo. The worker handles all Open-Meteo polling.

## UI Design (Apple Weather-Inspired)

- **Dark theme** with gradient backgrounds that shift based on weather/time of day
  - Clear day: blue-to-cyan gradient
  - Night: dark navy-to-purple gradient
  - Rainy: gray-to-slate gradient
  - Sunset: orange-to-purple gradient
- **Translucent cards** with backdrop-blur (glass morphism)
- **SF-style typography** — large bold temperature, clean sans-serif throughout
- **Smooth transitions** between locations (horizontal swipe or tab)
- **Live update indicator** — subtle pulse or timestamp showing data freshness
- **Responsive** — works on mobile and desktop, mobile-first layout

## Environment Variables

### Frontend (`apps/web/.env.local`)
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### Worker (`apps/worker/.env.local`)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
POLL_INTERVAL_MS=300000
```

### Platform Dashboards
- **Vercel**: Set frontend env vars in project settings (Settings → Environment Variables)
- **Railway**: Set worker env vars in service settings (Variables tab)

No weather API keys needed — Open-Meteo is completely free with no authentication.

## Deployment

| App | Platform | How |
|---|---|---|
| `apps/web/` | **Vercel** | Auto-deploys from `main` branch. Set root directory to `apps/web/`. |
| `apps/worker/` | **Railway** | Auto-deploys from `main` branch. Set root directory to `apps/worker/`. Start command: `npm start`. |

### Vercel Setup
- Connect GitHub repo
- Set root directory: `apps/web/`
- Framework preset: Next.js
- Add all frontend env vars
- Clerk dashboard must include Vercel domain in allowed redirect origins

### Railway Setup
- Connect same GitHub repo
- Set root directory: `apps/worker/`
- Set start command: `npm start` (runs compiled TypeScript)
- Add worker env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, POLL_INTERVAL_MS)
- Railway keeps the worker running continuously (no sleep on free tier with usage-based billing)

## Supabase MCP

```bash
claude mcp add supabase --transport http "https://mcp.supabase.com/mcp?project_ref=your-project-ref"
```

Replace `your-project-ref` with the actual Supabase project reference ID.

## Getting Started

```bash
# Install all dependencies (from repo root)
npm install

# Run frontend dev server
npm run dev --workspace=apps/web     # http://localhost:3000

# Run worker locally
npm run dev --workspace=apps/worker  # polls Open-Meteo in background
```

## Git Workflow

- Use multiple small, descriptive commits showing iteration
- Commit progression should show: scaffolding → database → worker → frontend → realtime → polish → deploy
- Each feature or meaningful change gets its own commit

## Security Rules

- Never read, display, or log the contents of `.env`, `.env.*`, or any file likely containing secrets.
- Never commit or stage `.env` files or secret-containing files.
- Never push secrets to GitHub. If secrets are accidentally staged, unstage them immediately and alert the user.
- The worker's `SUPABASE_SERVICE_ROLE_KEY` is especially sensitive — it bypasses RLS. Never expose it to the frontend.
