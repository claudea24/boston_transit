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
const VEHICLE_POLL_INTERVAL_MS = parseInt(process.env.VEHICLE_POLL_INTERVAL_MS || "15000", 10);

async function main() {
  const { pollVehicleData, pollWeatherData } = await import("./poller.js");

  console.log("Transit + weather worker started.");

  async function runWeatherCycle() {
    const start = Date.now();
    try {
      const count = await pollWeatherData();
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Weather poll complete: ${count} locations in ${duration}s`);
    } catch (error) {
      console.error("Weather poll failed:", error);
    }
  }

  async function runVehicleCycle() {
    const start = Date.now();
    try {
      const count = await pollVehicleData();
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Vehicle poll complete: ${count} vehicles in ${duration}s`);
    } catch (error) {
      console.error("Vehicle poll failed:", error);
    }
  }

  await Promise.all([runWeatherCycle(), runVehicleCycle()]);

  const weatherInterval = setInterval(runWeatherCycle, WEATHER_POLL_INTERVAL_MS);
  const vehicleInterval = setInterval(runVehicleCycle, VEHICLE_POLL_INTERVAL_MS);

  const shutdown = () => {
    console.log("Shutting down worker...");
    clearInterval(weatherInterval);
    clearInterval(vehicleInterval);
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main();
