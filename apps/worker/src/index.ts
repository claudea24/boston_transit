import { pollWeatherData } from "./poller.js";

const POLL_INTERVAL_MS = parseInt(
  process.env.POLL_INTERVAL_MS || "300000",
  10
);

async function main() {
  console.log(
    `Weather worker started. Polling every ${POLL_INTERVAL_MS / 1000}s`
  );

  // Run immediately on startup
  await runPollCycle();

  // Then poll on interval
  const interval = setInterval(runPollCycle, POLL_INTERVAL_MS);

  // Graceful shutdown
  const shutdown = () => {
    console.log("Shutting down worker...");
    clearInterval(interval);
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

async function runPollCycle() {
  const start = Date.now();
  try {
    const count = await pollWeatherData();
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Poll complete: ${count} locations fetched in ${duration}s`);
  } catch (error) {
    console.error("Poll cycle failed:", error);
  }
}

main();
