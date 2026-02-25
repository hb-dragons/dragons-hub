import { createMiddleware } from "hono/factory";
import { logger } from "../config/logger";
import type { AppEnv } from "../types";

const REDACTED_HEADERS = new Set(["authorization", "cookie", "set-cookie"]);

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = crypto.randomUUID();
  const childLogger = logger.child({ requestId });
  const start = performance.now();

  c.set("requestId", requestId);
  c.set("logger", childLogger);
  c.header("x-request-id", requestId);

  const { method, path } = c.req;
  const url = c.req.url;

  // Debug-level: log incoming request details
  if (childLogger.level === "debug" || childLogger.level === "trace") {
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = REDACTED_HEADERS.has(key) ? "[REDACTED]" : value;
    });
    childLogger.debug({ method, path, url, headers }, "→ incoming request");
  }

  await next();

  const duration = Math.round(performance.now() - start);
  const status = c.res.status;

  childLogger.info(
    { method, path, status, duration },
    `${method} ${path} → ${status} (${duration}ms)`,
  );

  // Debug-level: log response details
  if (childLogger.level === "debug" || childLogger.level === "trace") {
    const contentLength = c.res.headers.get("content-length");
    childLogger.debug({ status, duration, contentLength }, "← response sent");
  }
});
