import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";
import { env } from "./env";
import { getLogContext } from "./log-context";
import {
  CENSOR,
  SENSITIVE_ENV_KEYS,
  SENSITIVE_KEYS,
  scrub,
  withScrubbedChildren,
} from "./log-redact";

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

// Only bare (non-wildcard) paths live here. Two reasons they are not folded
// into the walk:
//
//   1. They are free. A bare path is a direct property lookup, measured at
//      parity with plain pino; the 81 wildcards this list used to carry cost
//      ~180us per line (#143).
//   2. They cover the one surface `formatters.log` cannot reach. Pino
//      serializes a child logger's bindings inside `child()`, before any log
//      formatter runs, so `logger.child({ password })` is caught here and
//      nowhere else. The *nested* case is handled by `withScrubbedChildren`.
//
// Everything below the top level — at any depth, inside arrays, in any
// container, in any casing — is handled by `scrub`.
const REDACT_PATHS = [...SENSITIVE_ENV_KEYS, ...SENSITIVE_KEYS];

// Redaction is environment-independent on purpose. A developer's terminal and a
// CI test log are still places a password or bearer token must not land, and
// keeping the rule identical everywhere means a redaction gap is visible during
// development instead of only in production.
const REDACT: LoggerOptions["redact"] = {
  paths: REDACT_PATHS,
  censor: CENSOR,
};

// Runs once per log call over the merged object. Also sees the mixin's output,
// so a sensitive field injected from request context is covered too.
const logFormatter = (o: Record<string, unknown>) => scrub(o);

const prodOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  messageKey: "message",
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: env.SERVICE_NAME, version: serviceVersion },
  formatters: {
    level: (label) => ({ severity: GCP_SEVERITY[label] ?? "DEFAULT" }),
    log: logFormatter,
  },
  mixin: logContextMixin,
  redact: REDACT,
};

const devOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  mixin: logContextMixin,
  redact: REDACT,
  formatters: { log: logFormatter },
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
  redact: REDACT,
  formatters: { log: logFormatter },
};

export function buildOptions(): LoggerOptions {
  if (isDev) return devOptions;
  if (isProd) return prodOptions;
  return testOptions;
}

/**
 * Builds a logger with the full redaction wiring: the declarative bare paths,
 * the any-depth `scrub` formatter, and the child-binding wrapper.
 *
 * Tests build their probe loggers through this rather than through
 * `pino(buildOptions())` so they exercise the same three-part wiring the app
 * runs. A probe assembled from `buildOptions()` alone would silently miss the
 * child wrapper, which is not part of the options object.
 *
 * Passing a `destination` also drops the `transport`: a pino-pretty worker
 * thread would swallow the writes a capture stream is trying to collect.
 * Redaction happens before serialization either way.
 */
export function createLogger(destination?: DestinationStream): Logger {
  const options = buildOptions();
  if (!destination) return withScrubbedChildren(pino(options));
  const { transport: _transport, ...withoutTransport } = options;
  return withScrubbedChildren(pino(withoutTransport, destination));
}

export const logger = createLogger();

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
