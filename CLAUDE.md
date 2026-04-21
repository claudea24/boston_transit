# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this project is

**Boston Transit** — a live MBTA map with weather-aware trip planning. Full-screen MapLibre map of Boston, every active MBTA vehicle rendered as a colored arrow at its real position, per-stop ETAs from the MBTA TripUpdates GTFS-RT feed, and HERE-routed trips drawn along real track/street geometry.

- **GitHub:** https://github.com/claudea24/boston_transit
- **Frontend (Vercel):** https://boston-transit.vercel.app
  - Dashboard: https://vercel.com/claudea24s-projects/boston-transit
- **Worker (Railway):** https://vivacious-patience-production-570c.up.railway.app (service `vivacious-patience`, `/healthz` for uptime)
  - Dashboard: https://railway.com/project/vivacious-patience
- **Supabase project:** ref `rybxmctxshbbqoaqbttj`
  - Dashboard: https://supabase.com/dashboard/project/rybxmctxshbbqoaqbttj

## Architecture

```
┌────────────────────┐   poll 10s    ┌───────────────────┐
│ MBTA VehiclePos    │ ────────────▶ │                   │
│ MBTA TripUpdates   │ ────────────▶ │  Worker (Railway) │
│ Open-Meteo weather │ ──── 60s ───▶ │                   │
└────────────────────┘               └───────────┬───────┘
                                                 │ upsert (service role)
                                                 ▼
                                     ┌───────────────────┐
                                     │ Supabase Postgres │
                                     │ + Realtime + RLS  │
                                     └───────────┬───────┘
                                                 │ postgres_changes
                                                 ▼
┌────────────────────┐                ┌──────────────────┐
│ HERE Routing /     │ ◀── /api/trip  │                  │
│ Geocoding          │     /api/geo.. │  Next.js (Vercel)│
│ MBTA v3 API        │ ◀── /api/stops │  MapLibre + Clerk│
└────────────────────┘     /api/routes└──────────────────┘
```

- **`apps/web/`** — Next.js 16 App Router on Vercel. Reads Supabase via the Clerk-authenticated client, subscribes to `postgres_changes` for live vehicle + prediction updates, proxies MBTA v3 (`/api/routes`, `/api/stops`) with a 6 h in-memory cache, and proxies HERE (`/api/geocode`, `/api/trip`).
- **`apps/worker/`** — Long-running Node process on Railway. Three pollers behind a `guardOverlap` wrapper: vehicles (10 s), predictions (10 s), weather (60 s). Exposes `/healthz` for uptime monitoring. Service-role upserts bypass RLS.
- **`packages/shared/`** — ESM workspace: types, geo helpers, GTFS-RT decoders (`vehicles.ts`, `tripUpdates.ts`, `trips.ts`), Open-Meteo client.

## Repo layout

```
apps/
  web/                          Next.js 16 App Router
    src/app/
      api/
        geocode/                HERE geocoder (Boston bbox) + Open-Meteo fallback
        routes/                 MBTA routes + ordered stops + decoded shapes, 6h TTL
        stops/                  Paginated MBTA stops (platforms + parent stations), 6h TTL
        trip/                   HERE Routing v8 proxy + HERE flex-polyline decoding
        weather/refresh/        One-shot Open-Meteo upsert
      page.tsx                  Full-bleed map + floating overlays
      layout.tsx                ClerkProvider + ClientProviders + Navbar
      sign-in/, sign-up/        Clerk catch-all routes
    src/components/
      map/TransitMap.tsx        MapLibre container + layers (vehicles, routes, stops, trip)
      trip/SearchCard.tsx       From/To + favorites chip row
      trip/ItineraryList.tsx    Ranked itineraries under SearchCard
      transit/LiveDepartures.tsx Per-stop ETA panel (real + estimated fallback)
      weather/WeatherPill.tsx   Top-right compact chip
    src/context/
      FavoritesContext, LocationContext, PredictionsContext,
      RoutesContext, StopsContext, TripContext, VehiclesContext, WeatherContext
    src/lib/
      supabase.ts               Clerk-authenticated Supabase client
      estimateEta.ts            ETA fallback from vehicle positions
      polyline.ts               Google polyline decoder
      hereFlexPolyline.ts       HERE flex polyline decoder
      ranking.ts                Weather-aware itinerary ranker
      tripRoutes.ts             Itinerary leg ↔ MBTA route matcher
  worker/                       Railway Node worker
    src/
      index.ts                  Interval scheduler with guardOverlap
      poller.ts                 pollVehicleData / pollPredictions / pollWeatherData + sweepers + /healthz
      supabase.ts               Service-role client
packages/
  shared/src/
    vehicles.ts                 GTFS-RT VehiclePositions fetch + decode (MBTA)
    tripUpdates.ts              GTFS-RT TripUpdates fetch + decode (with retry)
    trips.ts                    Trip-related shared types
    openMeteo.ts                fetchOpenMeteo + locationKey
    weatherCodes.ts             WMO code → description/icon
    geo.ts                      Haversine, bbox math
    types.ts                    Shared row types
railway.toml                    Root-level Railway build/start for apps/worker
.vercel/                        Project linked to claudea24s-projects/boston-transit
```

## Data model (Supabase)

- **`vehicle_positions`** — one row per `(agency_id, vehicle_id)`. Worker upserts every 10 s; sweeper deletes rows older than 3 min. RLS open to `anon, authenticated` for read. Published on `supabase_realtime`.
- **`stop_predictions`** — one row per `(trip_id, stop_id)` from MBTA TripUpdates. Worker upserts every 10 s; sweeper deletes rows with `predicted_arrival` older than 10 min. RLS `select` to `anon, authenticated`. Published on `supabase_realtime`.
- **`weather_data`** — keyed on `location_key`. Worker upserts every 60 s. Published on `supabase_realtime`.
- **`saved_places`** — user favorites. RLS: `(auth.jwt()->>'sub') = user_id` for `authenticated` only.
- **`user_preferences`** — per-user temp/wind units, optional active city centroid.

The legacy `saved_locations` table has been dropped.

## Worker pipelines (`apps/worker/`)

All three pollers run on intervals and share `guardOverlap` so a slow cycle skips the next tick instead of stacking.

| Poller | Interval | Source | Target table |
|---|---|---|---|
| `pollVehicleData` | 10 s | `cdn.mbta.com/realtime/VehiclePositions.pb` | `vehicle_positions` |
| `pollPredictions` | 10 s | `cdn.mbta.com/realtime/TripUpdates.pb` | `stop_predictions` (dedupes `(trip_id, stop_id)` before upsert — MBTA occasionally emits duplicates) |
| `pollWeatherData` | 60 s | Open-Meteo | `weather_data` |

`fetchMbtaTripUpdates` retries up to 3× on undici `SocketError: other side closed` and sends a descriptive `User-Agent`.

Per-vehicle `mode` is derived from the MBTA `route_id` pattern (Red/Blue/Orange/Green-*/Mattapan → rail or tram, `CR-*` → rail, `Boat-*` → ferry, else → bus), **not** a feed-level default.

## Web data contexts (`apps/web/src/context/`)

- **`PredictionsContext`** — demand-driven per-stop cache. `LiveDepartures` calls `requestStops([...ids])` on stop selection and re-queries on Realtime `postgres_changes`. 10 s periodic refresh covers missed Realtime events.
- **`VehiclesContext`** — bbox query + Realtime subscription. Local 10 s `setInterval` fallback. Worker owns all writes.
- **`RoutesContext`** — loads `/api/routes` once; exposes `routes`, `stopColors`, `stopToRoutes`, `routeColorById`. Parent stations inherit their children's route memberships via `StopsContext.stops[*].parentStation`.
- **`StopsContext`** — loads `/api/stops` once with 6 h cache. Includes platform (`locationType=0`) **and** parent-station (`locationType=1`) rows via pagination.
- **`FavoritesContext`** — reads/writes `public.saved_places` through the Clerk-authenticated Supabase client. No-op when signed out. RLS scopes rows by `(auth.jwt()->>'sub') = user_id`.
- **`TripContext` / `WeatherContext` / `LocationContext`** — trip selection state, current weather, fixed-Boston location + preferences.

## External APIs

| API | Purpose | Auth | Notes |
|---|---|---|---|
| MBTA v3 (`api-v3.mbta.com`) | Static routes, stops, shapes | optional `MBTA_API_KEY` (20→1000 req/min) | Web-only, via `/api/routes`, `/api/stops` |
| MBTA GTFS-RT (`cdn.mbta.com/realtime/*.pb`) | Live vehicles + predictions | none | Worker-only |
| HERE Routing v8 + Geocoding | Trip planning + From/To autocomplete | `HERE_API_KEY` (freemium 250k/mo) | Web-only, via `/api/trip`, `/api/geocode` |
| Open-Meteo | Weather forecast | none | Worker; geocode fallback on web |
| MapTiler Cloud | Vector tiles | public `NEXT_PUBLIC_MAPTILER_KEY` (free 100k/mo) | Falls back to `tiles.openfreemap.org/styles/liberty` when unset |

## Environment variables

Unified `/.env.local` at the repo root; per-app `.env.local` files are symlinks to it. Production values live in the platform dashboards.

**Web (`apps/web/`):**
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...                       # server-only
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_SUPABASE_URL=https://rybxmctxshbbqoaqbttj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
HERE_API_KEY=...                              # server-only
NEXT_PUBLIC_MAPTILER_KEY=...                  # optional
MBTA_API_KEY=...                              # optional, raises rate limit
```

**Worker (`apps/worker/`):**
```
SUPABASE_URL=https://rybxmctxshbbqoaqbttj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...       # bypasses RLS; never ship to browser
VEHICLE_POLL_INTERVAL_MS=10000
PREDICTION_POLL_INTERVAL_MS=10000
WEATHER_POLL_INTERVAL_MS=60000
```

**Server-only secrets** (never `NEXT_PUBLIC_`, never shipped to the browser): `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, `HERE_API_KEY`.

## Run commands

```bash
npm install                                    # repo root
npm run build --workspace=packages/shared      # rebuild shared after edits
npm run dev --workspace=apps/web               # Next.js at http://localhost:3000
npm run dev --workspace=apps/worker            # worker (optional locally)
npx tsc --noEmit -p apps/web/tsconfig.json     # typecheck web
```

## Deployment

- **Vercel** deploys `apps/web/`. Root Directory set to `apps/web`; framework auto-detected as Next.js. Env vars in the dashboard exclude `SUPABASE_SERVICE_ROLE_KEY` (worker-only).
- **Railway** deploys `apps/worker/`. `railway.toml` at the repo root defines `npm run build --workspace=packages/shared && npm run build --workspace=apps/worker` and `npm run start --workspace=apps/worker`. Restart policy `ON_FAILURE`, max 10 retries. `/healthz` is used for uptime monitoring.
- **Supabase** hosts Postgres + Realtime. Schema changes applied via the Supabase MCP (`mcp__supabase__apply_migration`).
- `.vercelignore` skips `node_modules` / build caches so deploys stay small.

## Product notes

- Boston / MBTA only — multi-city code paths and `TRANSITLAND_API_KEY` have been removed.
- Boston bbox geocoding: HERE uses `in=bbox:-71.6,42.05,-70.7,42.65`; Open-Meteo fallback is post-filtered.
- When a stop has no real MBTA prediction, `LiveDepartures` shows an *estimated* ETA from the nearest active vehicle on a serving route (haversine distance / max(reported speed, mode baseline)), clearly labeled as an estimate.
- Vehicle bearing is computed from the last polled position (`lastPolledRef`) — not the in-flight interpolation — so arrows face the direction of travel.
- When an itinerary is selected, vehicles on non-trip routes dim to 25 % via `tripRouteIdSet`.

## Intentionally deferred

- Friendly stop labels in `LiveDepartures` (currently raw MBTA stop IDs like `70502`, `place-pktrm`) — needs a stop-name reference table or static GTFS `stops.txt`.
- Clicking a stop directly on the map (no stops layer rendered yet).
- Linking `/api/trip` HERE itineraries to real MBTA `trip_id`s so legs can join `stop_predictions`.
- PWA / offline caching, push notifications, AI-style route suggestions across saved routines.
