if (process.env.NODE_ENV !== "production") {
  const { config } = await import("dotenv");
  const { resolve } = await import("node:path");
  config({ path: resolve(import.meta.dirname, "../../../.env") });
}

// Dynamic imports — must come after dotenv so env vars are available
// when modules that access env at top level (e.g. queues.ts) are loaded.
const { env } = await import("./config/env");
const { logger } = await import("./config/logger");

const mode = env.RUN_MODE;
const port = Number(process.env.PORT ?? 3001);

let httpServer: ReturnType<typeof import("@hono/node-server").serve> | undefined;
let shutdownWorkersFn: (() => Promise<void>) | undefined;

if (mode === "api" || mode === "both") {
  const { serve } = await import("@hono/node-server");
  const { app } = await import("./app");

  httpServer = serve({ fetch: app.fetch, port }, (info) => {
    logger.info(`API running at http://localhost:${info.port}`);
  });
}

if (mode === "worker" || mode === "both") {
  const { initializeWorkers, shutdownWorkers } = await import("./workers/index");
  shutdownWorkersFn = shutdownWorkers;
  await initializeWorkers();

  // Worker-only mode: start a minimal health-check server for Cloud Run
  if (mode === "worker") {
    const { createServer } = await import("node:http");
    const healthServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
    healthServer.listen(port, () => {
      logger.info(`Worker health check running at http://localhost:${port}`);
    });
    httpServer = healthServer as unknown as typeof httpServer;
  }
}

async function shutdown() {
  logger.info("Shutting down...");
  if (shutdownWorkersFn) await shutdownWorkersFn();
  if (httpServer) (httpServer as { close: () => void }).close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { mode, port };
