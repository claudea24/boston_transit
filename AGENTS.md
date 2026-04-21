# Live Transit Map with Weather-Aware Routing (Boston / MBTA)

A Google-Maps-style live transit app scoped to **Boston / MBTA** with weather-aware suggestions. The site opens to a full-screen MapLibre map centered on Boston, lets users enter a start and destination, zooms to the selected route, shows multiple transit options, surfaces moving MBTA buses and trains, and uses weather as a recommendation signal rather than the primary UI.

Live MBTA predictions (arrival ETAs) stream from the MBTA TripUpdates GTFS-RT feed into Supabase and are pushed to the browser via Supabase Realtime, where each row is shown with a minute-precision countdown that re-ticks locally.

This project is a monorepo with a Next.js frontend in `apps/web/` and a background worker in `apps/worker/`. The worker polls external APIs, writes normalized data into Supabase, and the frontend reads from Supabase with Realtime subscriptions so the UI updates live without refresh.

**GitHub**: https://github.com/claudea24/boston_transit
**Live URL (frontend)**: TBD (Vercel)
**Live URL (worker)**: Railway project `vivacious-patience` (service `vivacious-patience`)
**Supabase project ref**: `rybxmctxshbbqoaqbttj`

## Recent updates

This section captures meaningful changes beyond the original scaffolding so future agents can orient quickly. Architecture sections below still describe the overall system; this is a running changelog.

### Worker pipeline (`apps/worker/`)
- Added a third poller, `pollPredictions`, that pulls MBTA TripUpdates every 10 s and upserts into `stop_predictions`. Dedupes on `(trip_id, stop_id)` before upsert because MBTA occasionally emits two `stopTimeUpdate` rows for the same pair in one trip.
- `pollVehicleData` and `pollPredictions` default to **10 s** intervals; `pollWeatherData` stays at 60 s.
- Each cycle runs behind a `guardOverlap` wrapper so a slow poll (e.g. predictions taking ~15 s) skips the next tick instead of stacking.
- Deployed on Railway. `railway.toml` at repo root defines `npm run build` and `npm run start` against `apps/worker`. Restart policy `ON_FAILURE` max 10.

### Shared package (`packages/shared/`)
- `fetchMbtaTripUpdates` retries up to 3× on undici `SocketError: other side closed` against `cdn.mbta.com/realtime/TripUpdates.pb` and sends a descriptive `User-Agent`. The endpoint returns 200 via curl but flakes under Node fetch — the retry absorbs it.
- `tripUpdates.ts` was renamed/added during this refactor; `src/index.ts` re-exports it.

### Web app data contexts (`apps/web/src/context/`)
- **`PredictionsContext`** — rewritten as a **demand-driven, per-stop** cache. The old implementation fetched the next 200 upcoming arrivals globally, which clustered on Green/Red/Orange and left most buses without visible predictions. Now `LiveDepartures` calls `requestStops([...ids])` on stop selection and re-queries on Realtime `postgres_changes`. 10 s periodic refresh covers any missed Realtime events.
- **`VehiclesContext`** — queries by bbox from Supabase and subscribes to Realtime. Local fallback `setInterval` polls every 10 s. Removed the deleted `/api/vehicles/refresh` call — worker owns that now.
- **`RoutesContext`** (new) — loads `/api/routes` once, exposes `routes`, `stopColors`, `stopToRoutes`, and `routeColorById`. Parent stations inherit their children's route memberships by joining on `StopsContext.stops[*].parentStation`, so clicking `place-pktrm` correctly resolves to Red + the four Green branches.
- **`StopsContext`** (new) — loads `/api/stops` once with 6 h cache. Stops now include both platform (`locationType=0`) and parent-station (`locationType=1`) rows via pagination.
- **`FavoritesContext`** (new) — reads/writes `public.saved_places` through the Clerk-authenticated Supabase client. Tracks sign-in state; no-op when signed out. RLS on `saved_places` scopes rows to `(auth.jwt()->>'sub') = user_id`.

### New API routes (`apps/web/src/app/api/`)
- **`/api/routes`** — single MBTA call with `include=route_patterns.representative_trip.stops,route_patterns.representative_trip.shape` returns 170 routes, ordered stops, and street-accurate shapes in one request. Uses the canonical `route_pattern` per route when present. In-memory 6 h TTL. Supports optional `MBTA_API_KEY`.
- **`/api/stops`** — paginates `filter[location_type]=0,1` in 2000-row pages to capture all ~8000 MBTA stops (5000-row limit previously dropped all parent stations).
- **`/api/geocode`** — now restricts results to Boston metro via HERE `in=bbox:-71.6,42.05,-70.7,42.65` and post-filters the Open-Meteo fallback. Searching for places outside Boston returns empty.
- **`/api/trip`** — decodes HERE flexible polylines (`apps/web/src/lib/hereFlexPolyline.ts`) so each transit leg carries the real track/road geometry instead of a two-point straight line.
- Removed `/api/vehicles/refresh` and `/api/predictions/refresh` — worker is sole writer. Frontend reads via Supabase client + Realtime + fallback polling.

### Map + UI (`apps/web/src/components/`)
- `TransitMap` renders:
  - Vehicle arrows colored by their route's actual MBTA color (via `routeColorById`), not the mode fallback. Bearing is computed from the last polled position (`lastPolledRef`), not the in-flight interpolated position, so arrows face direction of travel.
  - Route polylines from MBTA shapes when available (subway/CR) and stop-to-stop lines for bus. When a stop is selected, routes passing through that stop are highlighted; others dim.
  - When an itinerary is selected, vehicles on non-trip routes are dimmed to 25 % via `tripRouteIdSet` (color-match against `leg.routeColor`).
- `SearchCard` redesigned Google-Maps-style: compact From/To row with colored pin dots, inline "Directions" button, favorite-star buttons on each result, "Your favorites" chip row for signed-in users, click-a-favorite fills whichever input is focused.
- `ItineraryList` rendered directly under `SearchCard` in a left-stack overlay (`.map-overlay--left-stack`). Scrolls internally when routes overflow.
- `LiveDepartures` — panel is hidden entirely (`return null`) until a stop is clicked. When a selected stop has no real MBTA prediction, a fallback "Estimated from live vehicle positions" list uses `estimateEtaForStop` (`haversine` distance / max(reported speed, mode baseline)) against nearby vehicles on serving routes.

### Data reliability
- `vehicle_positions` and `stop_predictions` both have sweepers that delete rows older than 3 min / 10 min respectively each cycle.
- MBTA vehicle feed returns ~500–600 active vehicles during Boston service hours. `stop_predictions` typically holds 25k–27k upcoming rows.


## Project Requirements

- Monorepo layout with `apps/web/` and `apps/worker/`
- Frontend built with Next.js and Tailwind CSS
- Background worker deployed on Railway and polling external data sources
- Supabase used as the shared database: worker writes, frontend reads
- Supabase Realtime used so live data appears without page refresh
- User authentication via Clerk or Supabase Auth
- User personalization via favorites and preferences
- Environment variables managed in `.env.local` locally and platform dashboards in production
- Supabase MCP server configured for the project
- `AGENTS.md` documents the architecture and developer workflow
- Git history should show multiple small commits rather than one large dump
- Frontend deployed to Vercel and worker deployed to Railway
- Live URLs should be usable by classmates, including sign-up and normal app usage

## Architecture Summary

### High-level design

- `apps/web/` is the user-facing Next.js app deployed to Vercel.
- `apps/worker/` is a long-running Node.js process deployed to Railway.
- Supabase is the shared source of truth between the frontend and worker.
- Clerk is the current authentication provider; Supabase Auth remains an acceptable alternative if the project ever pivots.
- Supabase Realtime pushes changes in `weather_data` and `vehicle_positions` to connected browsers.

### Responsibilities by layer

| Layer | Runs where | Responsibilities |
|---|---|---|
| **Frontend** | Vercel | Render the map UI, handle search and trip planning, read user data and live vehicle/weather data from Supabase, subscribe to Realtime, and present personalized favorites/preferences |
| **Worker** | Railway | Poll external transit and weather APIs on intervals, transform responses into app-friendly rows, and upsert them into Supabase |
| **Supabase** | Supabase Cloud | Store weather, vehicle, and user-specific data; enforce RLS; broadcast row changes through Realtime |
| **Auth** | Clerk Cloud | Handle sign-up/sign-in and provide identity used by frontend and RLS-aware Supabase access |

## Architecture Diagram

```
┌──────────────────┐    poll every 15s    ┌─────────────────┐
│  Agency GTFS-RT  │ ◄──────────────────── │                 │
│  feeds (direct)  │ ──── vehicles ─────► │                 │
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

### External services

| Component | What it is | Where it runs | Responsibility |
|---|---|---|---|
| **Frontend** | Next.js 16 App Router + MapLibre GL | Vercel | Full-screen world map, directions UI, live vehicle markers, route alternatives, weather-aware ranking, Clerk auth, calls `/api/trip` + reads Supabase via Realtime |
| **Worker** | Node.js long-running process | Railway | Two pipelines: (1) transit poll every 15 s for vehicle positions from direct GTFS-RT agency feeds, (2) weather poll every 60 s from Open-Meteo |
| **Supabase** | Postgres + Realtime + RLS | Supabase Cloud | Source of truth for vehicles, weather, saved places. Pushes changes to subscribed browsers via WebSocket |
| **Direct GTFS-RT feeds** | Agency-hosted protobuf vehicle feeds | Third-party | Live vehicle positions for the agencies we explicitly configure in `packages/shared/src/vehicles.ts` or `GTFS_RT_FEEDS_JSON` |
| **HERE Routing v8** | Multi-modal routing API | Third-party | Public transit + walking itineraries with ETAs. Freemium (250k txn/month) |
| **Open-Meteo** | Weather forecast API | Third-party | Current, hourly, daily weather. Free, no key |
| **MapTiler Cloud** | Vector map tiles | Third-party | Basemap styled for the dashboard. Free tier (100k map loads/month), public key |
| **Clerk** | Auth provider | Clerk Cloud | Sign-up / sign-in, issues JWTs consumed by Supabase RLS |

## Core Data Flows

### 1. Worker ingestion flow

- Railway worker polls external APIs on intervals.
- Transit data is fetched from direct agency GTFS-RT feeds.
- Weather data is fetched from Open-Meteo.
- Worker transforms both feeds into normalized Supabase rows.
- Worker upserts into tables such as `vehicle_positions` and `weather_data`.

### 2. Frontend live-read flow

- Next.js app loads initial data from Supabase.
- Browser subscribes to Supabase Realtime channels for weather and vehicle updates.
- When the worker writes new rows, connected clients receive updates automatically.
- Map markers and weather UI refresh without a page reload.

### 3. User trip-planning flow

- User enters **From** and **To** in the web app.
- Frontend calls `/api/geocode` and `/api/trip` to resolve places and route options.
- Map fits to the chosen route and renders alternatives.
- Current weather influences ranking so the recommended route can prefer more sheltered or shorter-walk options.

### Detailed trip and map flow

```
Step 1: User lands on `/`
─────────────────────────
Browser loads a full-world MapLibre map with lightweight floating controls and a
collapsed directions/search card in the top-left. Weather is secondary UI.

Step 2: User enters From and To (autocomplete via HERE Geocoding)
──────────────────────────────────────────────────────────────────
Browser → /api/geocode?q=… → HERE Geocoder → ranked place suggestions
Selecting a place drops pins and prepares the route request.

Step 3: User submits the trip
──────────────────────────────
Browser → POST /api/trip { from, to } → HERE Routing v8 (mode=publicTransport,
                                         return=polyline,travelSummary)
                                      ← itineraries[] each with legs[]
                                        (walk | bus | train), polyline,
                                        scheduled + realtime departure/arrival

Step 4: Frontend zooms to the route and presents options
─────────────────────────────────────────────────────────
Map calls `fitBounds()` around the origin, destination, and itinerary geometry.
Selected route draws in Google-Maps blue; alternatives draw in muted gray.
Bottom sheet / preview card lists route options with duration, transfers, and badges.

Step 5: Frontend ranks itineraries with current weather
────────────────────────────────────────────────────────
Browser pulls latest weather from WeatherContext → rankItineraries(itins, weather)
  - "Rainy" penalizes itineraries with >400m walking
  - "Snow" penalizes outdoor waits > 8 min
  - "Clear + short distance" boosts walking-only itineraries
Top-ranked itinerary appears first with a "Recommended" reason.

Step 6: Live vehicle positions appear on the map
────────────────────────────────────────────────
Worker (every 15 s) → configured GTFS-RT vehicle feeds near the viewport/user city
                    → upserts to public.vehicle_positions
                    → Supabase Realtime → browser subscribers in viewport
                    → MapLibre markers animate to new lat/lng
                      (simple linear interpolation between updates for smoothness)
Selected transit legs can highlight matching live buses or trains when available.

Step 7: ETA + delay badges on each route option
───────────────────────────────────────────────
Each transit leg has scheduled vs realtime times. Badge computes:
  - green "On time" if |delay| < 60 s
  - yellow "+3 min" if delayed 1–5 min
  - red "+12 min delay" if > 5 min
Also shows live vehicle icon on the relevant route polyline when present.

Step 8: Weather stays contextual, not dominant
───────────────────────────────────────────────
WeatherContext → current weather code + temp shown in a small top-right pill.
Optional rain/snow effects can be toggled on, but default UX keeps the map readable.
```

### What happens when...

| Scenario | What happens |
|---|---|
| **User opens the site** | They see a full-world map immediately with a compact Google-Maps-style search/directions card floating above it. No weather dashboard should block the map. |
| **User types a From/To** | Debounced `/api/geocode` calls HERE Geocoder; results cached briefly; clicking a result fills the input, sets map pins, and prepares route planning. |
| **User submits a trip** | `/api/trip` hits HERE Routing with `publicTransport` + walking fallback; returns up to 5 itineraries; frontend ranks by weather, fits the map to the route, and shows route alternatives in the bottom preview. |
| **User pans/zooms the map** | Viewport bbox is debounced and stored in state; the Realtime subscription filter is updated so we only receive vehicles in view. Worker always polls a broader area so we don't miss vehicles on zoom-in. |
| **Worker is down** | Map and trip planning still render; vehicle positions stop updating and a "Live feed offline" pill appears. Weather stays cached. |
| **Agency doesn't publish GTFS-RT** | We have no live vehicle feed for that agency. Vehicles don't render, but trip planning still works with scheduled times; badges should show "Schedule only, no realtime". |
| **User is signed out** | Map, directions, and weather-aware recommendations still work. Saving favorite places and preferences stays gated behind Clerk. |

## Tech Stack

- **Monorepo** — Turborepo with `apps/web/` (frontend) and `apps/worker/` (background poller), shared types/util in `packages/shared/`
- **Next.js 16** (App Router, Turbopack) + TypeScript — frontend
- **Tailwind CSS v4** — light Google-Maps-inspired surfaces (white cards with soft shadows), `#1a73e8` accent for routes, optional dark-mode toggle, rain/snow CSS overlays
- **MapLibre GL JS** — open-source map rendering
- **MapTiler Cloud** — vector tiles (free tier, public key in browser)
- **Node.js worker** (tsx, TypeScript) — transit + weather pollers on Railway
- **Clerk** — email sign-up/sign-in, JWT consumed by Supabase RLS
- **Supabase** — Postgres + Realtime + RLS
- **Direct GTFS-RT vehicle feeds** — agency-by-agency realtime endpoints configured in code or via `GTFS_RT_FEEDS_JSON`
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
│       │   │   └── transitPoll.ts              # GTFS-RT feeds → vehicle_positions
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
│       │   └── vehicles.ts                     # GTFS-RT feed config + fetchVehiclesByBbox()
│       ├── package.json                        # "type": "module"
│       └── tsconfig.json
│
├── turbo.json
├── package.json                                # Workspaces
├── .gitignore                                  # Excludes .env*
└── AGENTS.md                                   # Project architecture and workflow doc
```

## Core Features

### 1. Full-Screen World Map
- MapLibre GL vector map starts zoomed out to a world view on first load
- Pan / zoom / rotate; viewport bbox is tracked in `MapContext` and fed to `VehiclesContext`
- Search and directions UI float over the map instead of displacing it
- Smooth marker interpolation between poll updates (no teleporting)
- Clicking a vehicle shows a popover with route name, destination, delay badge, next stop

### 2. Directions-First Trip Planner
- Autocomplete inputs for **From** and **To** hit `/api/geocode` (HERE Geocoder)
- "Use my location" button for From (browser geolocation)
- Submit → `/api/trip` → HERE Routing v8 with `transportMode=publicTransport&return=polyline,travelSummary,actions`
- Returns up to 5 itineraries; each has legs: `pedestrian` (walk), `publicTransport` (bus/rail) with route + headsign + scheduled + realtime times
- On submit, the map zooms to the route geometry and the selected itinerary draws its polyline on the map

### 3. Live Vehicle Positions (Buses, Trains)
- Worker polls configured GTFS-RT feeds every 15 s, scoped by proximity to a rolling list of "active cities" (derived from where users are currently looking or have saved places)
- Upserts into `vehicle_positions`; Realtime pushes only rows in the user's current viewport via a bbox filter
- Each vehicle icon: 🚌 for bus, 🚆 for rail, with route color when available; rotation by bearing

### 4. Route Alternatives + ETA Clarity
- Show multiple route options at once, ordered top-to-bottom
- Selected route renders in blue; alternates remain clickable in gray
- Each option summarizes total duration, transfers, walking distance, and realtime delay status
- Selected transit legs can highlight the matching moving vehicle when available

### 5. Weather-Aware Ranking
- `lib/ranking.ts` takes itineraries + current weather code + temp and returns a sorted list
- Heuristics:
  - Rain (codes 51–82): penalize itineraries where total walking > 400 m (score −25 per extra 100 m)
  - Snow (codes 71–77, 85–86): penalize outdoor waits > 8 min and walking > 200 m
  - Hot (> 85 °F) or freezing (< 25 °F): penalize long walking
  - Clear + short trip (< 1.2 km): boost walking-only itineraries (score +15)
- Ranked list shown top-to-bottom with a "Recommended" badge on the top item

### 6. ETA & Delay Badges
- Scheduled vs realtime currently comes from what HERE returns for trip planning plus whatever individual GTFS-RT feeds expose for vehicle positions
- `DelayBadge` colors:
  - green "On time" — |delay| < 60 s
  - yellow "+N min" — 1 ≤ delay ≤ 5 min
  - red "+N min delay" — > 5 min
  - gray "Schedule only" — no realtime feed for this agency
- Shown on each leg and summarized on the itinerary card

### 7. Weather Context
- Top-right weather pill: temp + icon + description, clickable for expanded hourly strip
- Map overlay: optional CSS-animated rain or snow layer driven by current weather code
  - Rain: diagonal falling streaks on a canvas div above the map
  - Snow: drifting dots, slower
- Toggle in `MapControls` to hide the animation if it's too busy
- Weather should influence ranking and route messaging more than screen real estate

### 8. Location & Place Management
- Saved **places** (Home, Work, favorites) stored per user — used as From/To shortcuts
- Legacy "saved locations" from the weather-only version are auto-migrated into `saved_places` on first sign-in under their existing name

### 9. Live Updates (Supabase Realtime)
- Two subscriptions in the browser:
  - `weather_data` filtered by the viewport centroid's `location_key`
  - `vehicle_positions` filtered by the viewport's bbox (encoded in the channel name)
- Both are restarted when the viewport moves far enough to change the filter (debounced)

## Pages

| Route | Description |
|---|---|
| `/` | **Transit map** — full-screen world map + floating directions UI + route preview + weather context |
| `/sign-in`, `/sign-up` | Clerk authentication |

(The legacy `/search` page is kept but redirects to `/` with the search panel pre-opened — saved locations still work.)

## Authentication

Current implementation uses **Clerk**. Middleware protects `/` and relevant `/api/*` routes, and the Supabase client uses Clerk-issued tokens for authenticated access. The architecture would also support Supabase Auth if the project ever needs to simplify auth.

Personalized data such as saved places and user preferences is keyed to the authenticated user and protected with RLS policies using the auth subject.

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
| `agency_id` | text | Stable agency identifier from the configured feed entry (often an onestop-style id, e.g. `o-dp3-chicagotransitauthority`) |
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

### `stop_predictions` Table (new — live ETAs)

One row per `(trip_id, stop_id)` from MBTA's TripUpdates GTFS-RT feed. Clients render the countdown locally from `predicted_arrival`; the table is published on `supabase_realtime` so changes push to subscribers.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `agency_id` | text | Defaults to MBTA id — forward-compatible if we expand |
| `trip_id` | text | GTFS trip id |
| `route_id` | text | GTFS route id (`Red`, `22`, `Green-B`, `CR-Fairmount`, `Boat-F1`, …) |
| `route_short_name` | text | Mirror of `route_id` until we enrich with static GTFS metadata |
| `stop_id` | text | GTFS stop id (`70502`, `place-pktrm`, …) |
| `stop_sequence` | int4 | Nullable |
| `predicted_arrival` | timestamptz | Nullable — from TripUpdates stop_time_update.arrival.time |
| `predicted_departure` | timestamptz | Nullable — from TripUpdates stop_time_update.departure.time |
| `delay_seconds` | int4 | Nullable — arrival or departure delay if present |
| `vehicle_id` | text | Nullable — joins to `vehicle_positions.vehicle_id` |
| `updated_at` / `created_at` | timestamptz | |

Indexed on `predicted_arrival` and `(route_id, predicted_arrival)`. Unique on `(trip_id, stop_id)`. RLS grants `select` to `anon, authenticated`. Sweeper in `/api/predictions/refresh` deletes rows whose `predicted_arrival` is more than 10 minutes in the past.

### Full SQL Schema (new/changed tables only)

```sql
-- 0. stop_predictions (live ETAs from MBTA TripUpdates)
create table public.stop_predictions (
  id uuid primary key default gen_random_uuid(),
  agency_id text not null default 'o-drt-massbayareatransportationauthority',
  trip_id text not null,
  route_id text,
  route_short_name text,
  stop_id text not null,
  stop_sequence int4,
  predicted_arrival timestamptz,
  predicted_departure timestamptz,
  delay_seconds int4,
  vehicle_id text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index uniq_stop_predictions_trip_stop
  on public.stop_predictions (trip_id, stop_id);
create index idx_stop_predictions_arrival
  on public.stop_predictions (predicted_arrival);
create index idx_stop_predictions_route_arrival
  on public.stop_predictions (route_id, predicted_arrival);
alter table public.stop_predictions enable row level security;
create policy "Anyone can read stop predictions"
  on public.stop_predictions for select
  to anon, authenticated using (true);
alter publication supabase_realtime add table public.stop_predictions;

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
-- Policy was originally authenticated-only; opened to anon during the
-- Boston-only pivot so signed-out users can see the map, per spec.
create policy "Anyone can read vehicle positions"
  on public.vehicle_positions for select to anon, authenticated using (true);

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
   pick configured GTFS-RT feeds whose configured center/radius overlaps the city bbox
   fetch each agency VehiclePositions protobuf feed
   decode the feed and keep only vehicles inside the active bbox

3. Transform each vehicle into a vehicle_positions row using feed metadata
   (agency id, label, mode, route/trip identifiers), then upsert on
   (agency_id, vehicle_id).

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
| `src/pipelines/transitPoll.ts` | New — GTFS-RT feed fetch + decode + upsert |
| `src/supabase.ts` | Service-role client |

## External APIs

### Direct GTFS-RT vehicle feeds
- **Current implementation**: live vehicles are fetched from agency-hosted GTFS-RT VehiclePositions protobuf feeds, not from Transit.land.
- **Source of truth**: `packages/shared/src/vehicles.ts`
- **Configuration**:
  - built-in default feed list in code
  - optional `GTFS_RT_FEEDS_JSON` env var to add or override feed entries
- **`GTFS_RT_FEEDS_JSON` shape**: JSON array of objects with:
  - `id`
  - `agencyId`
  - `label`
  - `mode` (`bus` | `rail` | `tram` | `ferry` | `cable_car` | `other`)
  - `url`
  - `center.latitude`
  - `center.longitude`
  - `radiusKm`
- **Example**:
  ```json
  [
    {
      "id": "cta-blue-line",
      "agencyId": "o-dp3-chicagotransitauthority",
      "label": "CTA",
      "mode": "rail",
      "url": "https://example.org/gtfs-rt/vehiclepositions.pb",
      "center": { "latitude": 41.8781, "longitude": -87.6298 },
      "radiusKm": 45
    }
  ]
  ```
- **Selection model**: each feed has a configured center and radius; the worker only polls feeds near the current active city/viewport area.
- **What we get today**: lat/lon, bearing, speed, trip id, route id, and vehicle id when the agency feed provides them.
- **What we do not get automatically today**: broad world coverage, unified route metadata lookup, or stop/route enrichment across all agencies.

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

Map is the product. There should be no weather-app framing on first load. All controls float above the map in light, rounded, subtly-shadowed cards. Visual language should feel immediately familiar to anyone who has used Google Maps: minimal, high-contrast, utilitarian, and directions-first.

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

- **Initial load state**: the world map fills the viewport, search is compact, and there is no large weather card or dashboard panel competing with the map.
- **Top-left floating search card** (`SearchCard`): 420 px wide, white background, 12 px radius, soft shadow (`0 2px 12px rgba(0,0,0,.15)`). Starts as single `Search place…` input; expands into a two-field From/To card with a time picker and **Go** button when the user begins planning. This transition should mirror how Google Maps switches between browse mode and directions mode.
- **Right-side floating controls** (`MapControls`): stacked vertical pill of icon buttons — zoom in, zoom out, my-location, layers. Same palette as the search card. Hidden on touch devices where native gestures replace them, except **my-location** which stays.
- **Top-right weather pill** (`WeatherPill`): small white rounded chip with icon + temperature; clicking expands a dropdown with a 12-hour strip (`HourlyStrip`).
- **Bottom preview sheet** (`TripPreview`): once an itinerary is selected, a Google-Maps-style card docks at the bottom showing total time, arrival time, first leg icons, delay badge, and a chevron to expand into the full `ItineraryCard` with leg-by-leg details. This is where route options live; it should feel like directions results, not a weather panel. Drag-handle on mobile; pinned on desktop.

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

Local development uses a unified `/.env.local` at the repo root, symlinked into `apps/web/` and `apps/worker/`. Production values are set in the Vercel, Railway, Clerk, and Supabase dashboards rather than committed to git.

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
HERE_API_KEY=<server-only HERE Routing/Geocoder key>
GTFS_RT_FEEDS_JSON=<optional JSON array of extra/override GTFS-RT feed configs>

# Worker
POLL_INTERVAL_MS=60000           # weather cadence
TRANSIT_POLL_INTERVAL_MS=15000   # transit cadence
TRANSIT_CITIES=chicago,newyork   # csv of cities worker should poll (optional; if empty, derives from saved_places)
```

`GTFS_RT_FEEDS_JSON` is optional. If unset, the worker uses the default feed list in [`packages/shared/src/vehicles.ts`](/Users/claudea/projects/weather/packages/shared/src/vehicles.ts). If set, it must be valid JSON and each item must match the shape described in the External APIs section.

### Where to register (all free tiers)

| Service | Signup URL | Key name | Purpose |
|---|---|---|---|
| MapTiler Cloud | https://www.maptiler.com/cloud/ | `NEXT_PUBLIC_MAPTILER_KEY` | Basemap tiles |
| HERE Platform | https://platform.here.com/portal/ | `HERE_API_KEY` | Trip routing + geocoding |

## Deployment

- **Vercel** deploys `apps/web/`
- **Railway** deploys `apps/worker/`
- **Supabase** hosts the database and Realtime infrastructure
- Environment variables are configured in each platform dashboard
- The goal is for both live URLs to be accessible to classmates, with working sign-up and normal app usage

## Security Rules

- Never read, display, or log the contents of `.env`, `.env.*`, or any file likely to contain secrets.
- Never commit or stage `.env` files; verify `.gitignore` excludes them before any git op.
- **Server-only secrets** (must never be prefixed `NEXT_PUBLIC_` and must never reach the browser): `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, `HERE_API_KEY`.
- **Browser-safe keys** (OK under `NEXT_PUBLIC_*`, still subject to dashboard rate-limiting): `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAPTILER_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- The worker's service role key bypasses RLS — treat it like a root credential.

## Supabase MCP

The Supabase MCP server is configured for this project and scoped to project ref `rybxmctxshbbqoaqbttj`. It is used for schema inspection, migrations, and project operations during development.

## First-Time Setup

1. `npm install` at the repo root
2. Create `/.env.local` at the repo root with all keys listed above (per-app files are symlinks to it)
3. Activate Clerk ↔ Supabase third-party auth (one-time dashboard step, same as v1)
4. Apply new migrations (`mcp__supabase__apply_migration`) for `vehicle_positions`, `saved_places`, and `user_preferences` extensions
5. `npm run dev --workspace=apps/web` (http://localhost:3000) and `npm run dev --workspace=apps/worker` in another terminal

## Documentation

- `AGENTS.md` is the working product, architecture, and workflow spec for this repo.

## Git Workflow

Keep commits small and descriptive so the repo shows clear iteration. Avoid one giant commit for the entire build. Suggested commit progression for the pivot:

1. Update AGENTS.md
2. Schema migration: `vehicle_positions`, `saved_places`, extend `user_preferences`
3. Shared package: add `transitland.ts` + transit types
4. Worker: split into pipelines, add `transitPoll`
5. Web env + ClientProviders: add `VehiclesContext`, `MapContext`, `TripContext`
6. Web: `TransitMap` + `VehicleMarkerLayer` (map renders with live vehicles)
7. Web: `TripPlanner` + `/api/geocode` + `/api/trip`
8. Web: `lib/ranking.ts` + weather-aware ordering
9. Web: `WeatherOverlay` rain/snow CSS
10. Polish: delay badges, mobile bottom sheet, marker interpolation, cleanup sweep

## Product Direction

- First impression must be a world map, not a weather dashboard.
- Primary user journey is `From` → `To` → route options → zoom into the chosen route.
- Live buses and trains should become visible once the user is viewing a supported city/route area.
- Weather is still important, but as a recommendation layer that helps choose between routes rather than the main screen content.

## Current Implementation Status

### Next session pickup (last updated 2026-04-21)

**Scope pivot**: product was narrowed from multi-city to **Boston / MBTA only**. All non-MBTA feeds removed; UI copy, seed locations, demo location, and place suggestions are Boston-only.

**Phase 1 — DONE**
- Worker pipeline upserts MBTA vehicles to `vehicle_positions` every 15s via `packages/shared/src/vehicles.ts` → `fetchVehiclesByBbox`.
- `packages/shared/src/vehicles.ts` supports `{{VAR_NAME}}` env substitution; unresolved feeds log-and-skip.
- Per-vehicle `mode` is resolved from the MBTA `route_id` pattern (Red/Blue/Orange/Green-*/Mattapan → rail or tram, `CR-*` → rail, `Boat-*` → ferry, else → bus) instead of a single feed-level default. This fixed the "MBTA rows all labeled rail" bug.

**Phase 2 — DONE**
- `apps/web/src/components/map/TransitMap.tsx` rewritten in real MapLibre GL (no more SVG placeholder).
- Style: `api.maptiler.com/.../streets-v2` when `NEXT_PUBLIC_MAPTILER_KEY` is set, falls back to `tiles.openfreemap.org/styles/liberty` which needs no key.
- `apps/web/src/app/page.tsx` is now a full-bleed `.map-app` with floating overlays: `SearchCard` (top-left), `WeatherPill` (top-right), `LiveDepartures` (right column), coverage chip + live vehicle count (bottom-left), `ItineraryList` (bottom dock — only when itineraries exist). `layout.tsx` no longer wraps children in `max-w-7xl`.
- Vehicles render as a GeoJSON circle layer coloured by mode; trip polyline renders as a line layer with white casing; `fitBounds` (900ms, maxZoom 14) fires on trip selection.
- Navbar no longer shows `LocationSwitcher` or "Saved places" link; subtitle reads "Boston · MBTA".
- `SearchCard` has a "Popular in Boston" chip row (Back Bay, North Station, South Station, Fenway Park, Harvard Square, Logan Airport) that prefills the To input.
- RLS on `vehicle_positions` opened to `anon, authenticated` so signed-out users see the map; same pattern for `stop_predictions`.

**Phase 2.5 (new) — DONE: Live ETAs from Supabase Realtime**
- New Supabase table `public.stop_predictions` with RLS + `supabase_realtime` publication + unique `(trip_id, stop_id)` index. See SQL later in this doc.
- `packages/shared/src/tripUpdates.ts` → `fetchMbtaTripUpdates()` decodes `https://cdn.mbta.com/realtime/TripUpdates.pb` and returns `StopPrediction[]`.
- `apps/web/src/app/api/predictions/refresh/route.ts` pulls TripUpdates, upserts in 500-row chunks, sweeps entries with `predicted_arrival` older than 10 minutes.
- `apps/web/src/context/PredictionsContext.tsx` bootstraps the refresh, subscribes via `postgres_changes`, and debounces refetches (1.5s coalesce) to avoid thundering-herd on batch upserts. Also polls `/api/predictions/refresh` every 30s so the table stays fresh even without the worker running.
- `apps/web/src/components/transit/LiveDepartures.tsx` floats on the right side of the map showing up to 8 upcoming arrivals (arrival time within the next 30 min) as `[Route pill] stopId  in N min`. The "in N min" label re-renders every 15s from a local `setInterval`; it does **not** hit the network for each tick.

**Phase 3 — NOT STARTED: saved places**
- `saved_places` schema exists but frontend does not read/write it. We removed all other saved-city UI (`LocationSwitcher`, multi-location CRUD in `LocationContext`) because the app is Boston-only.
- If we revisit, scope changes to "favorite destinations within Boston" rather than multi-city.

**Run commands**
- `npm run build --workspace=packages/shared` — rebuild shared after edits there.
- `npm run dev --workspace=apps/web` — Next.js at http://localhost:3000.
- `npm run dev --workspace=apps/worker` — optional; refresh routes cover the client-triggered case.
- `npx tsc --noEmit -p apps/web/tsconfig.json` — typecheck web (runs clean currently).

**Known loose ends**
- Stop labels in `LiveDepartures` are raw MBTA stop IDs (`70502`, `place-pktrm`). Adding an MBTA stops reference table or shipping a static GTFS `stops.txt` snapshot would give friendly names.
- Clicking a stop on the map is not yet wired — the map has no stops layer.
- `/api/trip` still returns synthetic itineraries (HERE key not configured), so itinerary legs don't carry real MBTA `trip_id`s and can't be joined to `stop_predictions`.
- The worker still has a `pollVehicleData` loop but no `pollMbtaTripUpdates` — the web app's `/api/predictions/refresh` covers freshness today, but for 24/7 freshness without the tab open the worker should adopt the same call.
- The Clerk `afterSignOutUrl` prop on `UserButton` is deprecated (TS hint); not fixed.

**Removed in cleanup (2026-04-21)**
- `apps/web/src/components/location/LocationSwitcher.tsx`
- `apps/web/src/app/test-supabase/page.tsx`
- `apps/web/src/app/search/page.tsx`
- `apps/web/src/app/api/search/route.ts`
- All of `components/weather/*` except `WeatherPill.tsx` and `WeatherIcon.tsx` (`CurrentConditions`, `HourlyForecast`, `DailyForecast`, `StatCard`, `WindCard`, `PrecipitationCard`, `UVIndexCard`, `HumidityCard`, `VisibilityCard`, `PressureCard`, `SunriseSunsetCard`)
- `apps/web/src/lib/mappers/location.ts` (mappings no longer needed after LocationContext simplification)
- `LocationContext` trimmed to just `currentLocation` (fixed Boston), `preferences` (still Supabase-backed for signed-in users), and `loading`. `selectLocation`, `addLocation`, `removeLocation`, `setDefaultLocation`, `updatePreferences`, `locations[]`, and `isDemoMode` are gone.
- `TRANSITLAND_API_KEY` line deleted from `.env.local`.

## Transit API Change Summary

The architecture in this document originally assumed `Transit.land` for live transit ingestion. The codebase has since shifted to direct agency GTFS-RT feeds for vehicle positions, while keeping HERE for trip planning and Open-Meteo for weather.

### What changed

- Live vehicle ingestion is now driven by `packages/shared/src/vehicles.ts`, which contains a default list of agency GTFS-RT `VehiclePositions` feeds plus support for `GTFS_RT_FEEDS_JSON` overrides.
- The worker currently fetches protobuf feeds directly, decodes them with `gtfs-realtime-bindings`, filters vehicles by bbox, and upserts `vehicle_positions`.
- Feed coverage is currently limited to the agencies we explicitly configure, not all agencies in a viewport worldwide.
- Route metadata, stop metadata, and broad multi-agency discovery are not coming from a single transit aggregator right now.
- `TRANSITLAND_API_KEY` is no longer part of the active transit ingestion path in the checked-in code.

### Impact on the product spec

- "Full-world map" is still true for the basemap and routing UI, but live vehicles only appear in supported feed regions.
- "Multiple transit options" is still handled by HERE via `/api/trip`.
- "Live buses and trains" is only true where we have configured GTFS-RT agency feeds.
- Delay and schedule-only behavior still need refinement because the current direct-feed approach gives uneven metadata across agencies.

### Implemented so far

- Monorepo structure is in place with `apps/web`, `apps/worker`, and `packages/shared`.
- Supabase MCP is configured in `.mcp.json`, and Playwright MCP was added for local browser automation.
- Core shared modules exist for weather, routing fallbacks, geo helpers, and transit vehicle fetching.
- **Realtime transit ingestion is live** for **MBTA (Boston) only**. All other agencies were removed during the Boston-only pivot.
- `packages/shared/src/vehicles.ts` supports `{{ENV_VAR}}` substitution in feed URLs so credentials stay in `.env.local`; feeds whose env var is missing are logged and skipped.
- `apps/worker/src/poller.ts` seeds Boston, Portland, Chicago, NYC, and the existing small-agency cities so the bbox filter reaches every configured feed.
- The web app has a dashboard shell with:
  - trip search UI
  - itinerary list
  - current weather pill
  - simplified live transit map (still SVG placeholder, not MapLibre)
- Clerk auth pages, Clerk middleware, Supabase helpers, weather context, trip context, and vehicles context exist.
- API routes exist for:
  - `/api/geocode`
  - `/api/trip`
  - `/api/search`
  - `/api/weather/refresh`
  - `/api/vehicles/refresh`
- `vehicle_positions`, `saved_places`, and `user_preferences` transit-related schema updates have been applied in Supabase.

### Still needed to fully match this AGENTS.md spec

#### Map and realtime behavior

- Replace the current simplified SVG map with real `MapLibre GL`.
- Add `MapContext` for viewport, bounds, map pin state, and debounced bbox updates.
- Wire live vehicle subscriptions to the actual map viewport instead of the current location-centered bbox approximation.
- Add proper map layers/components from the planned structure:
  - `VehicleMarkerLayer`
  - `TripPolylineLayer`
  - `WeatherOverlay`
  - `MapControls`
- Add marker interpolation and vehicle popovers.
- Add worker health / live-feed status handling in the UI.

#### Trip planner UI

- Split the current trip UI into the planned components:
  - `FromToInput`
  - `TripPreview`
  - `ItineraryCard`
  - `LegRow`
  - `DelayBadge`
- Add the mobile bottom-sheet behavior described in the spec.
- Add “Recommended” and schedule-only states consistent with the design spec.

#### Routing and transit data quality

- Improve HERE Routing parsing beyond the current first-pass mapping.
- Parse real section geometry and use returned polylines instead of straight-line leg placeholders.
- Capture scheduled vs realtime departure/arrival values where HERE provides them.
- Improve route, mode, headsign, and agency mapping so itinerary legs are richer and more accurate.
- Link transit legs to live vehicles where possible so selected trips can highlight active vehicles on the map.
- Add better schedule-only behavior when realtime data is absent.

#### Transit API follow-through

- Decide whether to stay with direct GTFS-RT feeds or switch back to a transit aggregator such as Transit.land.
- If staying direct:
  - document the supported agencies as an explicit product limitation
  - expand `GTFS_RT_FEEDS_JSON` and/or `packages/shared/src/vehicles.ts` with more cities
  - add route/stop/headsign enrichment where the raw feeds are too sparse
- If switching back to an aggregator:
  - replace the direct-feed fetcher with an aggregator-backed module
  - restore the corresponding env var and onboarding docs
  - update this document again so the architecture matches the code

#### Weather overlay and ranking polish

- Implement the rain/snow animated overlay and its toggle in map controls.
- Add the expanded hourly strip behavior from the weather pill.
- Revisit ranking heuristics to fully match the thresholds described earlier in this document.

#### Saved places and preferences

- Move the frontend from legacy `saved_locations` usage to `saved_places`.
- Add support for:
  - `label`
  - `kind`
  - `address`
  - `is_default_from`
  - `is_default_to`
- Use `user_preferences.default_transport` and `active_city_centroid` in the app.
- Complete the one-time legacy migration story and decide when `saved_locations` can be retired.

#### Worker structure and polling strategy

- Refactor `apps/worker/src` to match the planned structure:
  - `src/pipelines/weatherPoll.ts`
  - `src/pipelines/transitPoll.ts`
  - `src/types.ts`
- Move away from the current all-in-one poller implementation.
- Implement the fuller “active cities” strategy described in the spec instead of relying mainly on seeded/current locations.
- Add more robust cleanup cadence, logging, and per-source error handling.

#### Frontend polish and spec alignment

- Align the file structure more closely with the planned component layout in this doc.
- Add the legacy `/search` redirect behavior to `/` with the search panel pre-opened.
- Add the visual polish still described but not yet implemented:
  - Google-Maps-like layered map UI
  - delay badge color system
  - weather-effects toggle
  - accessibility details
  - reduced-motion behavior

#### Deployment and operational follow-through

- Set final GitHub, Vercel, and Railway URLs in this document once deployed.
- Verify production env vars match the names documented above.
- Add end-to-end browser checks once Playwright MCP is reloaded and available in the client.

## What's intentionally deferred

- "Best route right now" AI-style suggestions across all saved routines
- Offline caching / PWA
- Route favorites + notifications ("Bus 22 is 2 stops away from your work stop")
- Multi-user shared trips
- Walking/biking preferences beyond weather ranking
