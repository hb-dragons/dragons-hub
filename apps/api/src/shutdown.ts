import { logger } from "./config/logger";

interface Closable {
  close(cb?: (err?: Error) => void): void;
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export interface ShutdownDeps {
  httpServer?: Closable;
  shutdownWorkers?: () => Promise<void>;
  closeDb: () => Promise<void>;
  closeRedis: () => Promise<void>;
  flushLogger: () => Promise<void>;
  exit: (code: number) => void;
  /** Overall deadline for the teardown sequence before forcing exit. */
  timeoutMs?: number;
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
 * guard makes repeated signals a no-op.
 *
 * A watchdog races the teardown against `timeoutMs`: any awaited step that
 * hangs (e.g. `server.close()` waiting on keep-alive sockets, or `redis.quit()`
 * during an outage) can otherwise block exit until the orchestrator escalates
 * to SIGKILL — aborting in-flight work and dropping the final log lines. On
 * timeout we log, flush, and force a non-zero exit instead. `code` carries the
 * shutdown reason (0 for a signal, non-zero for a crash) so the orchestrator
 * sees a crash as a crash.
 */
export function createShutdown(
  deps: ShutdownDeps,
): (code?: number) => Promise<void> {
  let shuttingDown = false;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  return async function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down...");

    const teardown = (async () => {
      try {
        if (deps.httpServer) await closeServer(deps.httpServer);
        if (deps.shutdownWorkers) await deps.shutdownWorkers();
        await deps.closeDb();
        await deps.closeRedis();
      } catch (err) {
        logger.error({ err }, "Error during graceful shutdown");
      }
    })();

    const timedOut = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(true), timeoutMs);
      // The watchdog must not keep the event loop alive on its own.
      timer.unref?.();
      void teardown.then(() => {
        clearTimeout(timer);
        resolve(false);
      });
    });

    if (timedOut) {
      code = code || 1;
      logger.error({ timeoutMs }, "Graceful shutdown timed out; forcing exit");
    }
    await deps.flushLogger();
    deps.exit(code);
  };
}

/**
 * Register process-level handlers so floating rejections and uncaught
 * exceptions are routed through pino (and flushed) instead of crashing
 * silently. An uncaught exception leaves the process in an undefined state, so
 * it triggers a graceful shutdown; an unhandled rejection is logged only.
 */
export function registerProcessHandlers(
  shutdown: (code?: number) => Promise<void>,
  proc: NodeJS.EventEmitter = process,
): void {
  proc.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection");
  });
  proc.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception; shutting down");
    void shutdown(1);
  });
}
