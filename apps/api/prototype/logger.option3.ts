// PROTOTYPE — issue #143, option 3. This is what src/config/logger.ts would
// become if option 3 were adopted. It is NOT wired in: nothing imports this
// file. To reproduce the "existing tests still pass" run, copy it over
// src/config/logger.ts (changing the two `../src/config/` imports back to
// `./`) and run `pnpm --filter @dragons/api test`.
//
// Result of that run, recorded 2026-07-29: 3922 of 3926 tests pass. The four
// failures are all in logger.test.ts and all assert the *shape* of the options
// object, not behaviour. Every functional through-a-real-pino redaction test
// passes unchanged, including the top-level cases from #140.
import pino, { type Logger, type LoggerOptions } from "pino";
import { env } from "../src/config/env";
import { getLogContext } from "../src/config/log-context";
import { scrub } from "./redact-walk";
import { withScrubbedChildren } from "./prototype-logger";

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

const SENSITIVE_KEYS = [
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "api_key",
  "secret",
  "authorization",
  "cookie",
];

// SENSITIVE_CONTAINERS is gone. The walk matches by key name at any depth, so
// there is no list of container names to keep in step with reality — and that
// list was the source of all 72 expensive two-level wildcards.
//
// Only bare paths remain here. They are free (measured at parity with plain
// pino) and they cover the one surface `formatters.log` cannot reach: pino
// serializes a child logger's bindings at `child()` time, before any log
// formatter runs.
const REDACT_PATHS = [
  "SDK_PASSWORD",
  "SDK_USERNAME",
  "BETTER_AUTH_SECRET",
  "SCOREBOARD_INGEST_KEY",
  "REFEREE_SDK_PASSWORD",
  "EXPO_ACCESS_TOKEN",
  ...SENSITIVE_KEYS,
];

// The any-depth walk. Runs once per log call over the merged object, and sees
// the mixin output as well as the caller's fields.
const logFormatter = (o: Record<string, unknown>) => scrub(o);

// Redaction is environment-independent on purpose. A developer's terminal and a
// CI test log are still places a password or bearer token must not land, and
// keeping the rule identical everywhere means a redaction gap is visible during
// development instead of only in production.
const REDACT: LoggerOptions["redact"] = {
  paths: REDACT_PATHS,
  censor: "[REDACTED]",
};

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

// `formatters.log` cannot reach a child logger's *nested* bindings, which
// `*.password` covers today. Wrapping `child` is what keeps coverage a strict
// superset rather than a trade. It is also the least pleasant part of option 3.
const rawLogger: Logger = pino(buildOptions());
export const logger = withScrubbedChildren(rawLogger);

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
