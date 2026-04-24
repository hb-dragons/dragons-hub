import pino, { type LoggerOptions } from "pino";
import { env } from "./env";
import { getLogContext } from "./log-context";

const isDev = env.NODE_ENV === "development";
const isProd = env.NODE_ENV === "production";

// Pino level label → Cloud Logging severity.
// https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#logseverity
const GCP_SEVERITY: Record<string, string> = {
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
  fatal: "CRITICAL",
};

const serviceVersion =
  env.SERVICE_VERSION ?? process.env.K_REVISION ?? "unknown";

// Merged into every log line from the active AsyncLocalStorage request context.
// Enables requestId + trace correlation without threading loggers through services.
function logContextMixin(): Record<string, string | boolean> {
  const ctx = getLogContext();
  if (!ctx) return {};
  const fields: Record<string, string | boolean> = {};
  if (ctx.requestId) fields.requestId = ctx.requestId;
  if (ctx.traceId) {
    fields["logging.googleapis.com/trace"] = env.GCP_PROJECT_ID
      ? `projects/${env.GCP_PROJECT_ID}/traces/${ctx.traceId}`
      : ctx.traceId;
  }
  if (ctx.spanId) fields["logging.googleapis.com/spanId"] = ctx.spanId;
  if (ctx.traceSampled !== undefined) {
    fields["logging.googleapis.com/trace_sampled"] = ctx.traceSampled;
  }
  return fields;
}

// Redact sensitive fields across the log tree. Cheaper and safer than
// per-caller sanitization.
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["set-cookie"]',
  "headers.authorization",
  "headers.cookie",
  'headers["set-cookie"]',
  "*.password",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.apiKey",
  "*.api_key",
];

const prodOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  messageKey: "message",
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: env.SERVICE_NAME, version: serviceVersion },
  formatters: {
    level: (label) => ({ severity: GCP_SEVERITY[label] ?? "DEFAULT" }),
  },
  mixin: logContextMixin,
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
};

const devOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  mixin: logContextMixin,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
      translateTime: "HH:MM:ss.l",
    },
  },
};

const testOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  mixin: logContextMixin,
};

function buildOptions(): LoggerOptions {
  if (isDev) return devOptions;
  if (isProd) return prodOptions;
  return testOptions;
}

export const logger = pino(buildOptions());

// Best-effort flush; used during graceful shutdown so the last log lines
// (often the interesting ones on SIGTERM) actually make it to stdout.
export async function flushLogger(): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      logger.flush(() => resolve());
    } catch {
      resolve();
    }
  });
}
