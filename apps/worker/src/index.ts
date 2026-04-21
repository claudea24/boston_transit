import http from "node:http";

try {
  process.loadEnvFile(".env.local");
  console.log(
    `Loaded .env.local from ${process.cwd()} — SUPABASE_URL set: ${Boolean(
      process.env.SUPABASE_URL
    )}`
  );
} catch (err) {
  console.warn(
    `Could not load .env.local from ${process.cwd()}:`,
    (err as Error).message
  );
}

const WEATHER_POLL_INTERVAL_MS = parseInt(process.env.WEATHER_POLL_INTERVAL_MS || "60000", 10);
const VEHICLE_POLL_INTERVAL_MS = parseInt(process.env.VEHICLE_POLL_INTERVAL_MS || "10000", 10);
const PREDICTION_POLL_INTERVAL_MS = parseInt(process.env.PREDICTION_POLL_INTERVAL_MS || "10000", 10);
const HEALTH_PORT = parseInt(process.env.PORT || "3001", 10);
const HEALTH_STALE_VEHICLE_MS = 120_000;
const HEALTH_STALE_PREDICTION_MS = 120_000;
const HEALTH_STALE_WEATHER_MS = 5 * 60_000;

interface HealthState {
  startedAt: number;
  lastVehicleSuccess: number | null;
  lastPredictionSuccess: number | null;
  lastWeatherSuccess: number | null;
  lastVehicleError: string | null;
  lastPredictionError: string | null;
  lastWeatherError: string | null;
}

function guardOverlap(label: string, fn: () => Promise<void>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) {
      console.log(`${label} skipped — previous cycle still running`);
      return;
    }
    running = true;
    try {
      await fn();
    } finally {
      running = false;
    }
  };
}

function startHealthServer(state: HealthState) {
  const server = http.createServer((req, res) => {
    if (req.url === "/healthz" || req.url === "/") {
      const now = Date.now();
      const vehicleAge = state.lastVehicleSuccess ? now - state.lastVehicleSuccess : null;
      const predictionAge = state.lastPredictionSuccess ? now - state.lastPredictionSuccess : null;
      const weatherAge = state.lastWeatherSuccess ? now - state.lastWeatherSuccess : null;
      const healthy =
        vehicleAge !== null &&
        vehicleAge < HEALTH_STALE_VEHICLE_MS &&
        predictionAge !== null &&
        predictionAge < HEALTH_STALE_PREDICTION_MS &&
        weatherAge !== null &&
        weatherAge < HEALTH_STALE_WEATHER_MS;
      res.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          {
            healthy,
            uptime_ms: now - state.startedAt,
            vehicle: { age_ms: vehicleAge, last_error: state.lastVehicleError, threshold_ms: HEALTH_STALE_VEHICLE_MS },
            prediction: { age_ms: predictionAge, last_error: state.lastPredictionError, threshold_ms: HEALTH_STALE_PREDICTION_MS },
            weather: { age_ms: weatherAge, last_error: state.lastWeatherError, threshold_ms: HEALTH_STALE_WEATHER_MS },
          },
          null,
          2
        )
      );
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  server.listen(HEALTH_PORT, () => {
    console.log(`[healthz] listening on :${HEALTH_PORT}`);
  });
  return server;
}

async function main() {
  const { pollPredictions, pollVehicleData, pollWeatherData } = await import("./poller.js");

  console.log("Transit + weather worker started.");

  const state: HealthState = {
    startedAt: Date.now(),
    lastVehicleSuccess: null,
    lastPredictionSuccess: null,
    lastWeatherSuccess: null,
    lastVehicleError: null,
    lastPredictionError: null,
    lastWeatherError: null,
  };

  const healthServer = startHealthServer(state);

  const runWeatherCycle = guardOverlap("Weather poll", async () => {
    const start = Date.now();
    try {
      const count = await pollWeatherData();
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Weather poll complete: ${count} locations in ${duration}s`);
      state.lastWeatherSuccess = Date.now();
      state.lastWeatherError = null;
    } catch (error) {
      console.error("Weather poll failed:", error);
      state.lastWeatherError = error instanceof Error ? error.message : String(error);
    }
  });

  const runVehicleCycle = guardOverlap("Vehicle poll", async () => {
    const start = Date.now();
    try {
      const count = await pollVehicleData();
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Vehicle poll complete: ${count} vehicles in ${duration}s`);
      state.lastVehicleSuccess = Date.now();
      state.lastVehicleError = null;
    } catch (error) {
      console.error("Vehicle poll failed:", error);
      state.lastVehicleError = error instanceof Error ? error.message : String(error);
    }
  });

  const runPredictionCycle = guardOverlap("Predictions poll", async () => {
    const start = Date.now();
    try {
      const count = await pollPredictions();
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Predictions poll complete: ${count} rows in ${duration}s`);
      state.lastPredictionSuccess = Date.now();
      state.lastPredictionError = null;
    } catch (error) {
      console.error("Predictions poll failed:", error);
      state.lastPredictionError = error instanceof Error ? error.message : String(error);
    }
  });

  await Promise.all([runWeatherCycle(), runVehicleCycle(), runPredictionCycle()]);

  const weatherInterval = setInterval(runWeatherCycle, WEATHER_POLL_INTERVAL_MS);
  const vehicleInterval = setInterval(runVehicleCycle, VEHICLE_POLL_INTERVAL_MS);
  const predictionInterval = setInterval(runPredictionCycle, PREDICTION_POLL_INTERVAL_MS);

  const shutdown = () => {
    console.log("Shutting down worker...");
    clearInterval(weatherInterval);
    clearInterval(vehicleInterval);
    clearInterval(predictionInterval);
    healthServer.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main();
