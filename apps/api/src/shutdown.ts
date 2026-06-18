import { logger } from "./config/logger";

interface Closable {
  close(cb?: (err?: Error) => void): void;
}

export interface ShutdownDeps {
  httpServer?: Closable;
  shutdownWorkers?: () => Promise<void>;
  closeDb: () => Promise<void>;
  closeRedis: () => Promise<void>;
  flushLogger: () => Promise<void>;
  exit: (code: number) => void;
}

function closeServer(server: Closable): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Build the graceful-shutdown handler. Closes resources in dependency order —
 * stop accepting requests, drain workers, then tear down DB and Redis — so the
 * pool is never ended out from under an in-flight request. A `shuttingDown`
 * guard makes repeated signals a no-op, and the try/finally guarantees the
 * logger flushes and the process exits even if a close step rejects.
 */
export function createShutdown(deps: ShutdownDeps): () => Promise<void> {
  let shuttingDown = false;
  return async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down...");
    try {
      if (deps.httpServer) await closeServer(deps.httpServer);
      if (deps.shutdownWorkers) await deps.shutdownWorkers();
      await deps.closeDb();
      await deps.closeRedis();
    } catch (err) {
      logger.error({ err }, "Error during graceful shutdown");
    } finally {
      await deps.flushLogger();
      deps.exit(0);
    }
  };
}

/**
 * Register process-level handlers so floating rejections and uncaught
 * exceptions are routed through pino (and flushed) instead of crashing
 * silently. An uncaught exception leaves the process in an undefined state, so
 * it triggers a graceful shutdown; an unhandled rejection is logged only.
 */
export function registerProcessHandlers(
  shutdown: () => Promise<void>,
  proc: NodeJS.EventEmitter = process,
): void {
  proc.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection");
  });
  proc.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception; shutting down");
    void shutdown();
  });
}
