# Boston Transit

A live transit dashboard for Boston/MBTA with weather-aware trip planning. The site opens to a full-screen MapLibre map of Boston, shows every MBTA bus, subway, commuter-rail, and ferry vehicle moving in real time, lets you tap any stop to see the next arrivals, and plans trips between two places with routes drawn along the actual tracks and streets.

**Live URLs**
- Frontend (Vercel): https://boston-transit.vercel.app — [dashboard](https://vercel.com/claudea24s-projects/boston-transit)
- Worker (Railway): https://vivacious-patience-production-570c.up.railway.app — [dashboard](https://railway.com/project/vivacious-patience) (health: `/healthz`)
- Supabase project `rybxmctxshbbqoaqbttj`: [dashboard](https://supabase.com/dashboard/project/rybxmctxshbbqoaqbttj)

---

## What it does

- **Live map.** Every active MBTA vehicle appears as a colored arrow at its real position, oriented to its direction of travel. Colors match the MBTA's official palette (Red Line `#DA291C`, Orange Line `#ED8B00`, Green Line branches `#00843D`, Blue Line `#003DA5`, commuter rail `#80276C`, bus `#FFC72C`). Vehicle positions refresh every 10 seconds.
- **Route overlays.** Subway, light rail, and commuter rail lines are drawn along their actual track geometry (from MBTA shape polylines). Bus routes are shown by connecting their stops. Clicking a stop highlights every route that serves it and dims the rest.
- **Per-stop ETAs.** Tap any stop on the map. A panel opens showing each route that serves the stop and the next arrivals pulled from the MBTA TripUpdates GTFS-RT feed. If MBTA has no published prediction for that stop (late at night, rural bus routes), the panel falls back to an *estimated* ETA computed from the nearest active vehicle on a serving route, labeled clearly as an estimate.
- **Trip planning.** Enter a From and a To. Trips are routed through HERE Transit Routing v8, drawn on the map with the actual street/rail geometry HERE returns (not straight lines), and listed below the search bar with durations, transfers, and walking distances. Selecting an itinerary dims vehicles that aren't on one of its routes so you can watch the exact bus or train you care about.
- **Boston-only search.** The geocoder is clamped to the Boston metro bounding box. Searches for "Paris" or "Seattle" return nothing.
- **Per-user favorites.** Sign in with Clerk, tap the ★ next to any search result or selected place, and it saves to your personal favorites list (stored in Supabase, protected by row-level security). Favorites replace the "Popular in Boston" chips and can be used as either the origin or destination based on which input is focused.
- **Weather overlay.** Current conditions for the active city (Boston) show in a compact panel. Weather refreshes every 60 seconds and feeds the trip-ranking signal so sheltered or less-walking routes rise when conditions are poor.

---

## Architecture

```
┌────────────────────┐   poll 10s    ┌───────────────────┐
│ MBTA VehiclePos    │ ────────────▶ │                   │
│ MBTA TripUpdates   │ ────────────▶ │  Worker (Railway) │
│ Open-Meteo weather │ ──── 60s ───▶ │                   │
└────────────────────┘               └───────────┬───────┘
                                                 │ upsert
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
└────────────────────┘                │  MapLibre + Clerk│
                                      └──────────────────┘
```

- **`apps/worker/`** — Long-running Node process. Every 10 s polls MBTA GTFS-RT for vehicles and trip updates; every 60 s polls Open-Meteo. Upserts into Supabase tables with an overlap guard so slow cycles skip instead of stacking. Deployed on Railway.
- **`apps/web/`** — Next.js 16 App Router app deployed on Vercel. Reads from Supabase via the Clerk-authenticated client, subscribes to `postgres_changes` for live updates, and calls MBTA v3 API on the server for static stop/route/shape data (cached for 6 hours).
- **`packages/shared/`** — TypeScript package shared between worker and web: GTFS-RT parsers, type definitions, geo utilities, Open-Meteo client.
- **Supabase** — `vehicle_positions`, `stop_predictions`, `weather_data`, `saved_places` (user favorites, RLS-scoped to `auth.jwt()->>'sub'`), `user_preferences`.

### Key libraries
- `maplibre-gl` for the map (OpenFreeMap tiles, or MapTiler if `NEXT_PUBLIC_MAPTILER_KEY` is set)
- `gtfs-realtime-bindings` + `protobufjs` for decoding MBTA protobuf feeds
- `@supabase/supabase-js` with Clerk session tokens as access tokens
- `@clerk/nextjs` for auth
- Custom Google-polyline and HERE-flexible-polyline decoders (in `apps/web/src/lib/`)

---

## Local development

Prerequisites: Node 22+, npm 10+, a Supabase project, a Clerk application, and (optional) HERE and MapTiler keys.

### 1. Install

```bash
npm install
```

### 2. Environment variables

Create `apps/web/.env.local`:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_…
CLERK_SECRET_KEY=sk_…
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…

# Optional
HERE_API_KEY=…
NEXT_PUBLIC_MAPTILER_KEY=…
MBTA_API_KEY=…                    # raises MBTA rate limit from 20/min to 1000/min
```

Create `apps/worker/.env.local`:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_…       # bypasses RLS; never ship to the browser
VEHICLE_POLL_INTERVAL_MS=10000
PREDICTION_POLL_INTERVAL_MS=10000
WEATHER_POLL_INTERVAL_MS=60000
```

**Never commit `.env.local`.** Both `.env` and `.env.local` are gitignored.

### 3. Supabase schema

The worker expects these tables in `public`:

- `vehicle_positions` (keyed on `(agency_id, vehicle_id)`)
- `stop_predictions` (keyed on `(trip_id, stop_id)`)
- `weather_data` (keyed on `location_key`)
- `saved_places` — user favorites, RLS policy `(auth.jwt()->>'sub') = user_id`
- `user_preferences` — temperature/wind units, optional city centroid

If you're cloning this into a fresh Supabase project, the most recent migration-like change applied through the Supabase MCP was `drop_legacy_saved_locations`. The full schema lives in the `supabase/migrations/` folder if you mirror the history locally, otherwise recreate the tables from the column definitions in `packages/shared/src/types.ts`.

Clerk + Supabase are wired through the native third-party auth integration — see `apps/web/src/lib/supabase.ts` for the client helper.

### 4. Run the apps

Two terminals:

```bash
# Terminal 1 — background worker
cd apps/worker && npm run dev

# Terminal 2 — web dashboard
cd apps/web && npm run dev
```

Open http://localhost:3000. The worker will start upserting into Supabase on the first cycle; the map will tick over to live data within ~15 s.

### 5. Useful scripts

From the repo root (Turborepo orchestrates across workspaces):

```bash
npm run dev       # runs all workspace dev servers
npm run build     # turbo build (shared compiles first)
npm run lint      # per-workspace lint
```

---

## Deployment

### Worker on Railway
The Railway project is named `vivacious-patience`. `railway.toml` at the repo root pins the build (`npm run build` for shared + worker) and start (`npm run start --workspace=apps/worker`) commands. Deploy with:

```bash
cd <repo-root>
railway up --ci --detach
```

Restart policy is `ON_FAILURE` with up to 10 retries — the worker self-heals from transient crashes.

### Frontend on Vercel
In Vercel project settings:
- **Root Directory:** `apps/web`
- **Framework preset:** Next.js (auto-detected)
- **Environment variables:** the same keys from `apps/web/.env.local` except `SUPABASE_SERVICE_ROLE_KEY` (server-only, belongs on Railway, never on Vercel or in the browser)

Redeploy after setting Root Directory so the `.next` output is discovered correctly.

---

## Layout

```
apps/
  web/               Next.js 16 App Router app
    src/app/
      api/
        geocode/     HERE geocoding (Boston bbox-restricted) with Open-Meteo fallback
        routes/      MBTA routes + stops + decoded shape polylines, 6h cache
        stops/       Paginated MBTA stops (platforms + parent stations), 6h cache
        trip/        HERE Routing v8 proxy with HERE flex-polyline decoding
      page.tsx       Dashboard — map overlays, search stack, coverage chip
      layout.tsx     Root layout + Clerk provider
    src/components/
      map/           TransitMap (MapLibre)
      trip/          SearchCard, ItineraryList
      transit/       LiveDepartures (per-stop ETA panel)
      weather/       WeatherPill
    src/context/     React contexts wrapping the Supabase-backed data
    src/lib/         Polyline decoders, ETA estimator, trip ↔ route matcher
  worker/            Railway-deployed Node worker
    src/
      index.ts       Interval scheduler with in-flight guard
      poller.ts      Vehicle, prediction, weather cycles
      supabase.ts    Service-role client
packages/
  shared/            Types, geo helpers, GTFS-RT parsers, Open-Meteo client
```

---

## License

No license declared. Intended for class use; reach out before reusing outside that context.
