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

async function main() {
  const { pollPredictions, pollVehicleData, pollWeatherData } = await import("./poller.js");

  console.log("Transit + weather worker started.");

  const runWeatherCycle = guardOverlap("Weather poll", async () => {
    const start = Date.now();
    try {
      const count = await pollWeatherData();
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Weather poll complete: ${count} locations in ${duration}s`);
    } catch (error) {
      console.error("Weather poll failed:", error);
    }
  });

  const runVehicleCycle = guardOverlap("Vehicle poll", async () => {
    const start = Date.now();
    try {
      const count = await pollVehicleData();
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Vehicle poll complete: ${count} vehicles in ${duration}s`);
    } catch (error) {
      console.error("Vehicle poll failed:", error);
    }
  });

  const runPredictionCycle = guardOverlap("Predictions poll", async () => {
    const start = Date.now();
    try {
      const count = await pollPredictions();
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Predictions poll complete: ${count} rows in ${duration}s`);
    } catch (error) {
      console.error("Predictions poll failed:", error);
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
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main();
