# Live Transit + Weather Dashboard

A multi-city live public-transit dashboard with weather overlay. Users pick a **From** and **To** location; the app suggests walking / bus / train options with live ETAs and delay badges, ranks them by current weather (e.g. raining → prefer covered transit over a long walk), and shows live vehicle positions (buses, trains) moving on an interactive map. Weather conditions are overlaid on the map with subtle rain/snow animations.

Built as a Turborepo monorepo with a Next.js 16 frontend (Vercel), a Node.js background worker (Railway) that polls transit + weather feeds, and Supabase as the shared source of truth using Postgres + Realtime so the map updates live with no page refresh.

**GitHub**: TBD
**Live URL (frontend)**: TBD (Vercel)
**Live URL (worker)**: TBD (Railway)
**Supabase project ref**: `rybxmctxshbbqoaqbttj`

## Architecture Overview

```
┌──────────────────┐    poll every 15s    ┌─────────────────┐
│  Transit.land    │ ◄──────────────────── │                 │
│  (GTFS-RT,       │ ──── vehicles ─────► │                 │
│  multi-agency)   │                      │                 │
└──────────────────┘                      │                 │
                                          │     Worker      │
┌──────────────────┐    poll every 60s    │   (Railway)     │
│   Open-Meteo     │ ◄──────────────────── │                 │
│  (free weather)  │ ──── forecast ─────► │                 │
└──────────────────┘                      └────────┬────────┘
                                                   │ upsert
                                                   ▼
                                          ┌─────────────────┐
                                          │    Supabase     │
                                          │  (Postgres +    │
                                          │   Realtime +    │
                                          │   RLS)          │
                                          └────────┬────────┘
                                                   │ postgres_changes (WebSocket)
                                                   ▼
┌──────────────────┐                      ┌─────────────────┐
│  HERE Routing v8 │ ◄─ /api/trip proxy ──│    Frontend     │
│  (transit+walk   │ ── itineraries ────► │  (Next.js 16,   │
│  free tier)      │                      │   Vercel)       │
└──────────────────┘                      │                 │
                                          │   MapLibre GL   │
┌──────────────────┐                      │   (MapTiler     │
│     Clerk        │ ◄── JWT for RLS ─────│    tiles)       │
│  (auth)          │                      └────────┬────────┘
└──────────────────┘                               │
                                                   ▼
                                           ┌─────────────┐
                                           │    User     │
                                           │  (browser)  │
                                           └─────────────┘
```

### System Components

| Component | What it is | Where it runs | Responsibility |
|---|---|---|---|
| **Frontend** | Next.js 16 App Router + MapLibre GL | Vercel | Map, trip planner, live vehicle markers, weather overlay, Clerk auth, calls `/api/trip` + reads Supabase via Realtime |
| **Worker** | Node.js long-running process | Railway | Two pipelines: (1) transit poll every 15 s for vehicle positions from Transit.land, (2) weather poll every 60 s from Open-Meteo |
| **Supabase** | Postgres + Realtime + RLS | Supabase Cloud | Source of truth for vehicles, weather, saved places. Pushes changes to subscribed browsers via WebSocket |
| **Transit.land** | GTFS-RT aggregator, multi-agency | Third-party | Worldwide vehicle positions, stops, routes, trip updates. Free tier, key required |
| **HERE Routing v8** | Multi-modal routing API | Third-party | Public transit + walking itineraries with ETAs. Freemium (250k txn/month) |
| **Open-Meteo** | Weather forecast API | Third-party | Current, hourly, daily weather. Free, no key |
| **MapTiler Cloud** | Vector map tiles | Third-party | Basemap styled for the dashboard. Free tier (100k map loads/month), public key |
| **Clerk** | Auth provider | Clerk Cloud | Sign-up / sign-in, issues JWTs consumed by Supabase RLS |

### Data Flow: Trip planning with live transit + weather

```
Step 1: User types From and To (autocomplete via HERE Geocoding)
────────────────────────────────────────────────────────────────
Browser → /api/geocode?q=… → HERE Geocoder → ranked place suggestions

Step 2: User submits the trip
──────────────────────────────
Browser → POST /api/trip { from, to } → HERE Routing v8 (mode=publicTransport,
                                         return=polyline,travelSummary)
                                      ← itineraries[] each with legs[]
                                        (walk | bus | train), polyline,
                                        scheduled + realtime departure/arrival

Step 3: Frontend ranks itineraries with current weather
────────────────────────────────────────────────────────
Browser pulls latest weather from WeatherContext → rankItineraries(itins, weather)
  - "Rainy" penalizes itineraries with >400m walking
  - "Snow" penalizes outdoor waits > 8 min
  - "Clear + short distance" boosts walking-only itineraries
Top-ranked itinerary appears first; others listed with badges

Step 4: Live vehicle positions on the map
─────────────────────────────────────────
Worker (every 15 s) → Transit.land /vehicles?bbox=<viewport or user city>
                    → upserts to public.vehicle_positions
                    → Supabase Realtime → browser subscribers in viewport
                    → MapLibre markers animate to new lat/lng
                      (simple linear interpolation between updates for smoothness)

Step 5: ETA + delay badges on the selected trip
────────────────────────────────────────────────
Each transit leg has scheduled vs realtime times. Badge computes:
  - green "On time" if |delay| < 60 s
  - yellow "+3 min" if delayed 1–5 min
  - red "+12 min delay" if > 5 min
Also shows live vehicle icon on the relevant route polyline when present

Step 6: Weather overlay on the map
───────────────────────────────────
WeatherContext → current weather code + temp shown top-right
If weatherCode ∈ rain codes (51–82) → CSS rain animation overlay
If weatherCode ∈ snow codes (71–77, 85–86) → CSS snow animation overlay
Toggle button lets users hide the animation
```

### What happens when...

| Scenario | What happens |
|---|---|
| **User types a From/To** | Debounced `/api/geocode` calls HERE Geocoder; results cached briefly; clicking a result fills the input and sets a pin on the map. |
| **User submits a trip** | `/api/trip` hits HERE Routing with `publicTransport` + walking fallback; returns up to 5 itineraries; frontend ranks by weather. |
| **User pans/zooms the map** | Viewport bbox is debounced and stored in state; the Realtime subscription filter is updated so we only receive vehicles in view. Worker always polls a broader area so we don't miss vehicles on zoom-in. |
| **Worker is down** | Map still renders; vehicle positions just stop updating and a "Live feed offline" pill appears. Weather stays cached. |
| **Agency doesn't publish GTFS-RT** | Transit.land returns schedule-only data for that agency. Vehicles don't render, but trip planning still works with scheduled times; badges show "Schedule only, no realtime". |
| **User is signed out** | Map + weather still work. Trip planner is gated behind Clerk so we can save favorite routes (phase 2). |

## Tech Stack

- **Monorepo** — Turborepo with `apps/web/` (frontend) and `apps/worker/` (background poller), shared types/util in `packages/shared/`
- **Next.js 16** (App Router, Turbopack) + TypeScript — frontend
- **Tailwind CSS v4** — light Google-Maps-inspired surfaces (white cards with soft shadows), `#1a73e8` accent for routes, optional dark-mode toggle, rain/snow CSS overlays
- **MapLibre GL JS** — open-source map rendering
- **MapTiler Cloud** — vector tiles (free tier, public key in browser)
- **Node.js worker** (tsx, TypeScript) — transit + weather pollers on Railway
- **Clerk** — email sign-up/sign-in, JWT consumed by Supabase RLS
- **Supabase** — Postgres + Realtime + RLS
- **Transit.land v2 REST API** — GTFS-RT aggregation for 2000+ agencies worldwide (free, register for API key at https://www.transit.land/documentation)
- **HERE Routing API v8** — public transit + walking itineraries across 1000+ cities (freemium 250k transactions/month, register at https://platform.here.com/)
- **Open-Meteo API** — weather (already integrated, free)
- **React Context** — app state (map viewport, selected trip, weather, location)

## Monorepo Structure

```
weather/ (repo root — name kept to avoid churning git history)
├── .env.local                              # Unified env file (symlinked from each app)
├── apps/
│   ├── web/                                # Next.js frontend (deployed to Vercel)
│   │   ├── .env.local → ../../.env.local   # Symlink
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx              # ClerkProvider + ClientProviders + Navbar
│   │   │   │   ├── page.tsx                # Map dashboard (trip planner + map)
│   │   │   │   ├── globals.css             # Tailwind + theme + rain/snow overlays
│   │   │   │   ├── api/
│   │   │   │   │   ├── geocode/route.ts    # HERE Geocoder proxy
│   │   │   │   │   ├── trip/route.ts       # HERE Routing proxy
│   │   │   │   │   ├── search/route.ts     # Open-Meteo geocoder (legacy, still used)
│   │   │   │   │   └── weather/refresh/route.ts  # One-shot Open-Meteo upsert
│   │   │   │   ├── sign-in/[[...sign-in]]/
│   │   │   │   └── sign-up/[[...sign-up]]/
│   │   │   ├── components/
│   │   │   │   ├── map/
│   │   │   │   │   ├── TransitMap.tsx          # MapLibre GL container
│   │   │   │   │   ├── VehicleMarkerLayer.tsx  # Live bus/train markers
│   │   │   │   │   ├── TripPolylineLayer.tsx   # Selected trip legs on map
│   │   │   │   │   ├── WeatherOverlay.tsx      # Rain/snow CSS animation
│   │   │   │   │   └── MapControls.tsx         # Style switcher, layer toggles
│   │   │   │   ├── trip/
│   │   │   │   │   ├── SearchCard.tsx          # Top-left Google-Maps-style search → directions card
│   │   │   │   │   ├── FromToInput.tsx         # Autocomplete pair (expanded state of SearchCard)
│   │   │   │   │   ├── TripPreview.tsx         # Bottom-docked preview card / bottom sheet on mobile
│   │   │   │   │   ├── ItineraryList.tsx       # Ranked suggestions list inside the preview
│   │   │   │   │   ├── ItineraryCard.tsx       # One suggestion with legs + badges
│   │   │   │   │   ├── LegRow.tsx              # Walk / bus / train row
│   │   │   │   │   └── DelayBadge.tsx          # On-time / delayed pill
│   │   │   │   ├── weather/
│   │   │   │   │   ├── WeatherPill.tsx         # Compact current-conditions chip
│   │   │   │   │   ├── HourlyStrip.tsx         # Tiny 12-hour forecast row
│   │   │   │   │   └── WeatherIcon.tsx         # WMO code → emoji
│   │   │   │   ├── Navbar.tsx
│   │   │   │   └── ClientProviders.tsx
│   │   │   ├── context/
│   │   │   │   ├── MapContext.tsx              # Viewport, bounds, selected pin
│   │   │   │   ├── TripContext.tsx             # Current trip + results + selection
│   │   │   │   ├── VehiclesContext.tsx         # Live vehicle positions + Realtime sub
│   │   │   │   ├── WeatherContext.tsx          # Current weather + Realtime sub
│   │   │   │   └── LocationContext.tsx         # User's saved places & preferences
│   │   │   ├── lib/
│   │   │   │   ├── supabase.ts                 # Client-side supabase (uses Clerk JWT)
│   │   │   │   ├── supabase-server.ts          # Server-only supabase + service-role client
│   │   │   │   ├── mappers/                    # Row → app-type mappers
│   │   │   │   ├── units.ts                    # Unit conversions
│   │   │   │   ├── ranking.ts                  # Weather-aware itinerary ranker
│   │   │   │   └── geo.ts                      # Haversine, bbox math
│   │   │   └── middleware.ts                   # Clerk route protection
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   └── tsconfig.json
│   │
│   └── worker/                                 # Background worker (Railway)
│       ├── .env.local → ../../.env.local       # Symlink
│       ├── src/
│       │   ├── index.ts                        # Entry — loads env, runs two pipelines
│       │   ├── supabase.ts                     # Service-role client
│       │   ├── pipelines/
│       │   │   ├── weatherPoll.ts              # Open-Meteo → weather_data
│       │   │   └── transitPoll.ts              # Transit.land → vehicle_positions
│       │   └── types.ts
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                                 # ESM workspace package
│       ├── src/
│       │   ├── index.ts                        # Re-exports
│       │   ├── types.ts                        # Shared TS interfaces
│       │   ├── weatherCodes.ts                 # WMO code → description/icon
│       │   ├── openMeteo.ts                    # fetchOpenMeteo(), locationKey()
│       │   └── transitland.ts                  # fetchVehiclesByBbox(), types
│       ├── package.json                        # "type": "module"
│       └── tsconfig.json
│
├── turbo.json
├── package.json                                # Workspaces
├── .gitignore                                  # Excludes .env*
└── CLAUDE.md                                   # This file
```

## Core Features

### 1. Interactive Transit Map
- MapLibre GL vector map (dark theme styled via MapTiler)
- Pan / zoom / rotate; viewport bbox is tracked in `MapContext` and fed to `VehiclesContext`
- Smooth marker interpolation between poll updates (no teleporting)
- Clicking a vehicle shows a popover with route name, destination, delay badge, next stop

### 2. Live Vehicle Positions (Buses, Trains)
- Worker polls Transit.land every 15 s, scoped to a rolling list of "active cities" (derived from where users are currently looking or have saved places)
- Upserts into `vehicle_positions`; Realtime pushes only rows in the user's current viewport via a bbox filter
- Each vehicle icon: 🚌 for bus, 🚆 for rail, with route color when available; rotation by bearing

### 3. Trip Planner (From → To)
- Autocomplete inputs for **From** and **To** hit `/api/geocode` (HERE Geocoder)
- "Use my location" button for From (browser geolocation)
- Submit → `/api/trip` → HERE Routing v8 with `transportMode=publicTransport&return=polyline,travelSummary,actions`
- Returns up to 5 itineraries; each has legs: `pedestrian` (walk), `publicTransport` (bus/rail) with route + headsign + scheduled + realtime times
- Selected itinerary draws its polyline on the map

### 4. Weather-Aware Ranking
- `lib/ranking.ts` takes itineraries + current weather code + temp and returns a sorted list
- Heuristics:
  - Rain (codes 51–82): penalize itineraries where total walking > 400 m (score −25 per extra 100 m)
  - Snow (codes 71–77, 85–86): penalize outdoor waits > 8 min and walking > 200 m
  - Hot (> 85 °F) or freezing (< 25 °F): penalize long walking
  - Clear + short trip (< 1.2 km): boost walking-only itineraries (score +15)
- Ranked list shown top-to-bottom with a "Recommended" badge on the top item

### 5. ETA & Delay Badges
- Scheduled vs realtime from GTFS-RT trip updates (Transit.land attaches these to route/trip lookups)
- `DelayBadge` colors:
  - green "On time" — |delay| < 60 s
  - yellow "+N min" — 1 ≤ delay ≤ 5 min
  - red "+N min delay" — > 5 min
  - gray "Schedule only" — no realtime feed for this agency
- Shown on each leg and summarized on the itinerary card

### 6. Weather Overlay
- Top-right glass-morphism pill: temp + icon + description, clickable for expanded hourly strip
- Map overlay: optional CSS-animated rain or snow layer driven by current weather code
  - Rain: diagonal falling streaks on a canvas div above the map
  - Snow: drifting dots, slower
  - Toggle in `MapControls` to hide the animation if it's too busy

### 7. Location & Place Management
- Saved **places** (Home, Work, favorites) stored per user — used as From/To shortcuts
- Legacy "saved locations" from the weather-only version are auto-migrated into `saved_places` on first sign-in under their existing name

### 8. Live Updates (Supabase Realtime)
- Two subscriptions in the browser:
  - `weather_data` filtered by the viewport centroid's `location_key`
  - `vehicle_positions` filtered by the viewport's bbox (encoded in the channel name)
- Both are restarted when the viewport moves far enough to change the filter (debounced)

## Pages

| Route | Description |
|---|---|
| `/` | **Dashboard** — map + trip planner side panel + weather overlay |
| `/sign-in`, `/sign-up` | Clerk authentication |

(The legacy `/search` page is kept but redirects to `/` with the search panel pre-opened — saved locations still work.)

## Authentication (Clerk)

Unchanged from the weather-only version. Middleware protects `/` + `/api/*` (except `/sign-in`, `/sign-up`). Supabase client uses Clerk's native integration via `accessToken()` callback. RLS policies keyed on `auth.jwt()->>'sub'`.

## Database (Supabase)

### Tables Overview

```
┌──────────────────────┐          ┌──────────────────────┐
│    saved_places      │          │   user_preferences   │
│    (per user)        │          │   (per user)         │
│                      │          │                      │
│ user_id (Clerk)      │          │ user_id (Clerk)      │
│ label (Home/Work/..) │          │ temp_unit, wind_unit │
│ name, address        │          │ default_transport    │
│ lat, lon             │          │ active_city_centroid │
│ kind (home|work|fav) │          └──────────────────────┘
└──────────────────────┘
           │ From/To shortcuts for the trip planner
           ▼
┌──────────────────────┐
│    vehicle_positions  │ ◄── Worker upserts every 15 s
│    (per vehicle)      │ ──► Frontend reads filtered by bbox + Realtime subscribes
│                       │
│ id (uuid pk)          │
│ agency_id, vehicle_id │   unique composite
│ route_id, route_name  │
│ trip_id, headsign     │
│ mode (bus|rail|...)   │
│ latitude, longitude   │
│ bearing, speed_kmh    │
│ delay_seconds (nullable)
│ stop_sequence (nullable)
│ updated_at            │
└──────────────────────┘

┌──────────────────────┐
│    weather_data       │ ◄── Worker upserts every 60 s
│    (per location_key) │ ──► Frontend reads + Realtime subscribes
│                       │
│ unchanged from v1     │
└──────────────────────┘
```

### `vehicle_positions` Table (new)

One row per vehicle per agency. Worker upserts on every poll. Rows older than 15 min are swept by a scheduled cleanup.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `agency_id` | text | Transit.land operator onestop_id (e.g. `o-dp3-chicagotransitauthority`) |
| `vehicle_id` | text | Vehicle identifier within the agency |
| `route_id` | text | Route onestop_id |
| `route_short_name` | text | e.g. `Blue`, `22`, `L1` |
| `route_color` | text | Hex, e.g. `#00a1de` |
| `trip_id` | text | Optional — current trip |
| `headsign` | text | Destination headsign |
| `mode` | text | `bus` | `rail` | `tram` | `ferry` | `cable_car` | `other` |
| `latitude` | float8 | |
| `longitude` | float8 | |
| `bearing` | float8 | Degrees, optional |
| `speed_kmh` | float8 | Optional |
| `delay_seconds` | int4 | Nullable — only when feed provides trip updates |
| `stop_sequence` | int4 | Nullable |
| `updated_at` | timestamptz | Server time of upsert |
| `created_at` | timestamptz | |

Unique key: `(agency_id, vehicle_id)`.
Indexed on `(latitude, longitude)` for bbox filters, and on `updated_at` for sweeps.

### `saved_places` Table (new — replaces the old `saved_locations`)

| Column | Type | Description |
|---|---|---|
| `id` | uuid | |
| `user_id` | text | Clerk user id |
| `label` | text | User-given label ("Home", "Gym") |
| `kind` | text | `home` | `work` | `favorite` |
| `name` | text | Display name (e.g. "Chicago, Illinois") |
| `address` | text | Reverse-geocoded full address |
| `latitude` | float8 | |
| `longitude` | float8 | |
| `is_default_from` | boolean | Prefill From input |
| `is_default_to` | boolean | Prefill To input |
| `created_at` | timestamptz | |

RLS: users manage only their own rows.

### `user_preferences` Table (extended)

Same as before + two new columns:

| Column | Type | Description |
|---|---|---|
| `default_transport` | text | `transit` (default) | `walk` | `any` |
| `active_city_centroid` | point | Optional (lat,lon) hint used by the worker to prioritize which cities' transit feeds to poll first |

### `weather_data` Table (unchanged from v1)

### Full SQL Schema (new/changed tables only)

```sql
-- 1. vehicle_positions
create table public.vehicle_positions (
  id uuid primary key default gen_random_uuid(),
  agency_id text not null,
  vehicle_id text not null,
  route_id text,
  route_short_name text,
  route_color text,
  trip_id text,
  headsign text,
  mode text not null,
  latitude float8 not null,
  longitude float8 not null,
  bearing float8,
  speed_kmh float8,
  delay_seconds int4,
  stop_sequence int4,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index uniq_vehicle_positions_agency_vehicle
  on public.vehicle_positions (agency_id, vehicle_id);
create index idx_vehicle_positions_coords
  on public.vehicle_positions (latitude, longitude);
create index idx_vehicle_positions_updated_at
  on public.vehicle_positions (updated_at);

alter table public.vehicle_positions enable row level security;
create policy "Authenticated users can read vehicle positions"
  on public.vehicle_positions for select to authenticated using (true);

alter publication supabase_realtime add table public.vehicle_positions;

-- 2. saved_places (replaces saved_locations)
create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  label text not null,
  kind text not null default 'favorite',
  name text not null,
  address text not null default '',
  latitude float8 not null,
  longitude float8 not null,
  is_default_from boolean not null default false,
  is_default_to boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.saved_places enable row level security;
create policy "Users manage own places"
  on public.saved_places for all to authenticated
  using (((select auth.jwt()->>'sub') = (user_id)::text));

create index idx_saved_places_user
  on public.saved_places (user_id);

-- 3. Extend user_preferences
alter table public.user_preferences
  add column if not exists default_transport text not null default 'transit',
  add column if not exists active_city_centroid point;

-- 4. One-time migration: copy saved_locations into saved_places as 'favorite'
insert into public.saved_places
  (user_id, label, kind, name, latitude, longitude, is_default_from, is_default_to, created_at)
select user_id, name, 'favorite', name, latitude, longitude, false, is_default, created_at
from public.saved_locations;
-- saved_locations kept around briefly for safety, dropped in a follow-up migration.
```

### Realtime Configuration
Two tables publish changes: `weather_data` (from v1) and `vehicle_positions` (new). Both are on the `supabase_realtime` publication.

### How the frontend joins the data (client-side)

1. On auth load: fetch `saved_places` + `user_preferences`
2. On map mount: open two Realtime channels — one for `weather_data` at the viewport centroid, one for `vehicle_positions` filtered by viewport bbox
3. On From/To submit: POST `/api/trip`, get itineraries, merge with weather to rank
4. On itinerary select: draw polyline; if the leg has an active `vehicle_id`, highlight that vehicle on the map

## Worker (`apps/worker/`)

The worker now runs **two independent pipelines** in the same process, on separate intervals.

### Pipeline 1 — Transit poll (every 15 s)

```
1. Determine active cities:
   select distinct user_preferences.active_city_centroid
   union
   (viewport centroids reported by currently-connected frontends — stretch goal; v1
    can just poll a fixed list of major cities plus the centroid of all saved places)

2. For each active city:
   GET https://api.transit.land/api/v2/rest/vehicles
     ?bbox=<minLon,minLat,maxLon,maxLat>
     &api_key=<TRANSITLAND_API_KEY>
     &limit=500
   → list of vehicles with lat/lon/bearing/route/trip

3. Transform each vehicle into a vehicle_positions row, infer mode from route type,
   upsert on (agency_id, vehicle_id).

4. Every 5 poll cycles, sweep: delete from vehicle_positions where updated_at < now() - '3 minutes'.

5. Log per-cycle counts; continue on per-agency errors (rate limits, 5xx).
```

### Pipeline 2 — Weather poll (every 60 s)

Unchanged from v1: query distinct lat/lon from `saved_places` (formerly `saved_locations`) and from the active viewport centroid, fetch Open-Meteo, upsert `weather_data`.

### Worker Files

| File | Purpose |
|---|---|
| `src/index.ts` | Loads `.env.local`, starts both pipelines on their intervals, handles graceful shutdown |
| `src/pipelines/weatherPoll.ts` | Existing logic moved here |
| `src/pipelines/transitPoll.ts` | New — Transit.land fetch + transform + upsert |
| `src/supabase.ts` | Service-role client |

## External APIs

### Transit.land v2 REST API
- **Base URL**: `https://api.transit.land/api/v2/rest`
- **Auth**: `api_key` query param. Register at https://www.transit.land/documentation for a free key.
- **Endpoints used**:
  - `/vehicles?bbox=…` — live vehicle positions across all agencies in the bbox
  - `/routes/<onestop_id>` — route metadata (color, name)
  - `/stops?lat=…&lon=…&radius=…` — stops near a point
- **Rate limits**: generous free tier (exact numbers vary; we stay under by batching bboxes).

### HERE Routing API v8
- **Base URL**: `https://router.hereapi.com/v8/routes`
- **Auth**: `apiKey` query param. Register at https://platform.here.com/portal/ for a free API key (Freemium tier: 250 000 transactions/month).
- **Key params**:
  - `transportMode=publicTransport`
  - `origin=<lat>,<lon>&destination=<lat>,<lon>`
  - `return=polyline,travelSummary,actions,typicalDuration`
  - `alternatives=4`
- **Returns**: up to 5 itineraries; each has ordered sections (legs) with `type` = `pedestrian` or `transit`, plus scheduled/realtime timestamps when the underlying agency publishes GTFS-RT.
- **Geocoding**: `https://geocode.search.hereapi.com/v1/geocode?q=&apiKey=` — used by `/api/geocode`.

### Open-Meteo API
Unchanged from v1. Weather forecast, no key.

### MapTiler Cloud
- **Default style URL (light, Google-Maps-like)**: `https://api.maptiler.com/maps/streets-v2/style.json?key=<NEXT_PUBLIC_MAPTILER_KEY>`
- **Dark toggle**: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=<NEXT_PUBLIC_MAPTILER_KEY>`
- **Auth**: public key in `NEXT_PUBLIC_MAPTILER_KEY`, rate-limited per key. Free tier: 100 000 map loads/month.
- Register at https://www.maptiler.com/cloud/.

## Data Model (TypeScript — `packages/shared/`)

```typescript
// Existing types kept (CurrentWeather, HourlyForecast, DailyForecast, WeatherData, WeatherDataRow)

// ── Transit ──────────────────────────────────────────

export type VehicleMode =
  | "bus" | "rail" | "tram" | "ferry" | "cable_car" | "other";

export interface VehiclePosition {
  agencyId: string;
  vehicleId: string;
  routeId?: string;
  routeShortName?: string;
  routeColor?: string;          // e.g. "#00a1de"
  tripId?: string;
  headsign?: string;
  mode: VehicleMode;
  latitude: number;
  longitude: number;
  bearing?: number;             // degrees
  speedKmh?: number;
  delaySeconds?: number;
  stopSequence?: number;
  updatedAt: string;            // ISO
}

export interface VehiclePositionRow {
  id: string;
  agency_id: string;
  vehicle_id: string;
  route_id: string | null;
  route_short_name: string | null;
  route_color: string | null;
  trip_id: string | null;
  headsign: string | null;
  mode: VehicleMode;
  latitude: number;
  longitude: number;
  bearing: number | null;
  speed_kmh: number | null;
  delay_seconds: number | null;
  stop_sequence: number | null;
  updated_at: string;
  created_at: string;
}

// ── Trip planner ─────────────────────────────────────

export interface Place {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
}

export type LegMode = "walk" | "bus" | "rail" | "tram" | "ferry" | "transit";

export interface TripLeg {
  mode: LegMode;
  from: Place;
  to: Place;
  departure: string;               // ISO, realtime preferred
  arrival: string;
  scheduledDeparture?: string;     // if different from realtime
  scheduledArrival?: string;
  durationSeconds: number;
  distanceMeters: number;
  polyline: [number, number][];    // [lng, lat] pairs for MapLibre
  // Transit-only fields
  routeShortName?: string;
  routeColor?: string;
  headsign?: string;
  agencyId?: string;
  numStops?: number;
  vehicleId?: string;              // when realtime matches a vehicle
  delaySeconds?: number;
}

export interface Itinerary {
  id: string;                      // stable hash for list keys
  from: Place;
  to: Place;
  departure: string;
  arrival: string;
  durationSeconds: number;
  totalWalkMeters: number;
  totalWaitSeconds: number;
  legs: TripLeg[];
  score?: number;                  // set by weather-aware ranker
  scoreReason?: string;            // "Rainy — prefer train"
}

// ── Saved places ─────────────────────────────────────

export type PlaceKind = "home" | "work" | "favorite";

export interface SavedPlace {
  id: string;
  userId: string;
  label: string;
  kind: PlaceKind;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  isDefaultFrom: boolean;
  isDefaultTo: boolean;
  createdAt: string;
}
```

## API Routes (Frontend — `apps/web/`)

| Route | Purpose |
|---|---|
| `/api/geocode?q=…` | HERE Geocoder proxy for From/To autocomplete |
| `/api/trip` (POST) | HERE Routing proxy: body `{from, to, departureTime?}` → `{itineraries: Itinerary[]}` |
| `/api/search?q=…` | (kept for legacy) Open-Meteo geocoder |
| `/api/weather/refresh` (POST) | Existing one-shot Open-Meteo fetch-and-upsert |

All routes require a signed-in Clerk session.

## UI Design (Google Maps / Waze-inspired)

Map is the canvas — no page chrome above or below it. All controls float over the map in light, rounded, subtly-shadowed cards. Visual language matches what users already know from Google Maps: minimal, high-contrast, utilitarian.

### Layout — desktop (≥ 768 px)

```
┌────────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────┐                                                  │
│  │ 🔍 Search place… │                                     ┌──────────┐ │
│  └──────────────────┘                                     │ 68° ☀    │ │
│  ┌──────────────────┐                                     │ Clear    │ │
│  │ ●  From          │                                     └──────────┘ │
│  │ ○  To            │                                                  │
│  │ [ Now ▾ ]  [ Go ]│                                     ┌──┐        │
│  └──────────────────┘                                     │➕│         │
│                                                           ├──┤        │
│                                                           │➖│         │
│                                                           ├──┤        │
│                                                           │📍│         │
│                                                           ├──┤        │
│                                                           │🗂│ layers │
│                                                           └──┘        │
│                                                                        │
│                     <the map fills everything>                         │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ 27 min · arrive 4:42 PM · 🚍 22 → 🚆 Red Line                  │   │
│  │ [On time]  [+2 min]                          (Recommended)    │   │
│  └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

- **Top-left floating search card** (`SearchCard`): 420 px wide, white background, 12 px radius, soft shadow (`0 2px 12px rgba(0,0,0,.15)`). Starts as single `Search place…` input; expands into a two-field From/To card with a time picker and **Go** button when the user begins planning. Exactly how Google Maps transitions between "search" and "directions" modes.
- **Right-side floating controls** (`MapControls`): stacked vertical pill of icon buttons — zoom in, zoom out, my-location, layers. Same palette as the search card. Hidden on touch devices where native gestures replace them, except **my-location** which stays.
- **Top-right weather pill** (`WeatherPill`): small white rounded chip with icon + temperature; clicking expands a dropdown with a 12-hour strip (`HourlyStrip`).
- **Bottom preview sheet** (`TripPreview`): once an itinerary is selected, a Google-Maps-style card docks at the bottom showing total time, arrival time, first leg icons, delay badge, and a chevron to expand into the full `ItineraryCard` with leg-by-leg details. Drag-handle on mobile; pinned on desktop.

### Layout — mobile (< 768 px)

- Search card collapses to full-width at the top.
- Right-side controls collapse to a single floating **my-location** FAB bottom-right.
- Trip preview is a draggable bottom sheet with three snap points: peek (80 px), half (45 %), full. Matches Google Maps bottom sheet behavior.

### Theme

- **Light by default** (matches Google Maps). Map style: MapTiler `streets-v2` for the base style; we also wire a dark-mode toggle that swaps to `streets-v2-dark`.
- **Surfaces**: `#ffffff` cards, `#f8fafc` page fallback behind the map, `#1f2937` primary text, `#2563eb` accent/route blue (the exact blue Google Maps uses for directions).
- **No glass-morphism** on the transit UI — that stays out of the way. Weather pill is still a light chip with a subtle border, not translucent.

### Route & vehicle rendering

- **Selected route polyline**: 6 px stroke in `#1a73e8` (Google Maps blue) with a 10 px white casing for readability on both light and dark basemaps.
- **Alternative routes**: 5 px stroke in `#9aa0a6` (medium gray). Clicking one promotes it to selected.
- **Walking legs** in both the selected and alternatives use a dashed pattern (`[2, 6]`) to distinguish from transit.
- **Vehicle markers**: circular badge with route color fill, 2 px white border, route short-name in the center when space allows. Rotates by `bearing`; smooth 800 ms linear interpolation between worker updates. On click → `VehiclePopover` (Google-Maps-style white card anchored above the marker) with headsign, next stop, delay badge.
- **Transit stops** along the selected route: small circular nodes (white center, route-colored ring) exactly like Google Maps.

### Colors for delay badges

- **On time** (`|delay| < 60 s`) → `#1e8e3e` text on `#e6f4ea` chip
- **Minor delay** (1–5 min) → `#b06000` text on `#fff6e0` chip
- **Major delay** (> 5 min) → `#c5221f` text on `#fce8e6` chip
- **Schedule only** (no realtime feed) → `#5f6368` text on `#f1f3f4` chip

These match the muted, accessible palette Google Maps uses for traffic indicators.

### Weather overlay

- **Default**: just the weather pill — no full-screen animation, so it doesn't fight the map.
- **"Show weather effects" toggle** (inside the layers button): when on and the current weather code is rain or snow, renders a low-opacity full-screen canvas with CSS-animated streaks/flakes (`position: fixed; inset: 0; pointer-events: none;` at `opacity: .35`). Off by default on mobile to save battery.

### Transitions

- Search card expand/collapse: 180 ms ease-out height + opacity.
- Bottom sheet drag: spring animation matching iOS-native feel.
- Polyline selection change: 240 ms color interpolation.
- Map camera moves (fitBounds on trip submit): `flyTo` with 900 ms duration.

### Accessibility

- All floating buttons are `aria-label`ed.
- Keyboard flow: Search input → From → To → Go. Tab through itineraries with arrow keys once the preview is open.
- Focus ring visible on all controls (2 px `#1a73e8` outline).
- Delay badges include `aria-label` like "Delayed 12 minutes".
- Reduced-motion: marker interpolation shortens to 200 ms; overlay animations disabled.

## Environment Variables

All in the unified `/.env.local` at the repo root (symlinked from both apps).

```
# Clerk (web only)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://rybxmctxshbbqoaqbttj.supabase.co
SUPABASE_URL=https://rybxmctxshbbqoaqbttj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# Map + Transit + Routing
NEXT_PUBLIC_MAPTILER_KEY=<public MapTiler key>
TRANSITLAND_API_KEY=<server-only Transit.land key>
HERE_API_KEY=<server-only HERE Routing/Geocoder key>

# Worker
POLL_INTERVAL_MS=60000           # weather cadence
TRANSIT_POLL_INTERVAL_MS=15000   # transit cadence
TRANSIT_CITIES=chicago,newyork   # csv of cities worker should poll (optional; if empty, derives from saved_places)
```

### Where to register (all free tiers)

| Service | Signup URL | Key name | Purpose |
|---|---|---|---|
| MapTiler Cloud | https://www.maptiler.com/cloud/ | `NEXT_PUBLIC_MAPTILER_KEY` | Basemap tiles |
| Transit.land | https://www.transit.land/documentation | `TRANSITLAND_API_KEY` | Live vehicles, stops, routes |
| HERE Platform | https://platform.here.com/portal/ | `HERE_API_KEY` | Trip routing + geocoding |

## Deployment

Same split as before:
- **Vercel** deploys `apps/web/` on push to `main`
- **Railway** deploys `apps/worker/` on push to `main`
- Env vars are set in each platform's dashboard (they don't read the local `.env.local`)

## Security Rules

- Never read, display, or log the contents of `.env`, `.env.*`, or any file likely to contain secrets.
- Never commit or stage `.env` files; verify `.gitignore` excludes them before any git op.
- **Server-only secrets** (must never be prefixed `NEXT_PUBLIC_` and must never reach the browser): `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, `TRANSITLAND_API_KEY`, `HERE_API_KEY`.
- **Browser-safe keys** (OK under `NEXT_PUBLIC_*`, still subject to dashboard rate-limiting): `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAPTILER_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- The worker's service role key bypasses RLS — treat it like a root credential.

## Supabase MCP

Still project-scoped in `.mcp.json`. Project ref: `rybxmctxshbbqoaqbttj`.

## First-Time Setup

1. `npm install` at the repo root
2. Create `/.env.local` at the repo root with all keys listed above (per-app files are symlinks to it)
3. Activate Clerk ↔ Supabase third-party auth (one-time dashboard step, same as v1)
4. Apply new migrations (`mcp__supabase__apply_migration`) for `vehicle_positions`, `saved_places`, and `user_preferences` extensions
5. `npm run dev --workspace=apps/web` (http://localhost:3000) and `npm run dev --workspace=apps/worker` in another terminal

## Git Workflow

Keep commits small and descriptive. Suggested commit progression for the pivot:

1. Update CLAUDE.md (this doc)
2. Schema migration: `vehicle_positions`, `saved_places`, extend `user_preferences`
3. Shared package: add `transitland.ts` + transit types
4. Worker: split into pipelines, add `transitPoll`
5. Web env + ClientProviders: add `VehiclesContext`, `MapContext`, `TripContext`
6. Web: `TransitMap` + `VehicleMarkerLayer` (map renders with live vehicles)
7. Web: `TripPlanner` + `/api/geocode` + `/api/trip`
8. Web: `lib/ranking.ts` + weather-aware ordering
9. Web: `WeatherOverlay` rain/snow CSS
10. Polish: delay badges, mobile bottom sheet, marker interpolation, cleanup sweep

## What's intentionally deferred

- "Best route right now" AI-style suggestions across all saved routines
- Offline caching / PWA
- Route favorites + notifications ("Bus 22 is 2 stops away from your work stop")
- Multi-user shared trips
- Walking/biking preferences beyond weather ranking
