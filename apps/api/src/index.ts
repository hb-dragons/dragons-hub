import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

// Dynamic imports — must come after dotenv so env vars are available
// when modules that access env at top level (e.g. queues.ts) are loaded.
const { serve } = await import("@hono/node-server");
const { app } = await import("./app");
const { initializeWorkers, shutdownWorkers } = await import("./workers/index");

const port = Number(process.env.PORT ?? 3001);

await initializeWorkers();

const server = serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`API running at http://localhost:${info.port}`);
});

async function shutdown() {
  console.log("[Server] Shutting down...");
  await shutdownWorkers();
  server.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
