// PROTOTYPE — issue #143, option 3. Shows how `scrub` would be wired into
// pino, and what still has to stay declarative.
import type { Logger, LoggerOptions } from "pino";
import { scrub } from "./redact-walk";

// `formatters.log` sees the per-call object and the mixin output, but NOT a
// child logger's bindings — pino serializes those once at `child()` time,
// before any log formatter runs. Verified in prototype/redact-walk.test.ts.
// So the bare paths stay: they are free (measured at parity with plain pino)
// and they cover the top level of every surface, including child bindings.
export const BARE_PATHS = [
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "api_key",
  "secret",
  "authorization",
  "cookie",
  "SDK_PASSWORD",
  "SDK_USERNAME",
  "BETTER_AUTH_SECRET",
  "SCOREBOARD_INGEST_KEY",
  "REFEREE_SDK_PASSWORD",
  "EXPO_ACCESS_TOKEN",
];

export function prototypeRedact(): LoggerOptions["redact"] {
  return { paths: BARE_PATHS, censor: "[REDACTED]" };
}

/**
 * Applies the option-3 walk to an existing options object: keeps the cheap
 * bare paths, drops the 81 wildcards, adds the walk as `formatters.log`.
 */
export function withPrototypeRedaction(options: LoggerOptions): LoggerOptions {
  return {
    ...options,
    redact: prototypeRedact(),
    formatters: {
      ...options.formatters,
      log: (o: Record<string, unknown>) => scrub(o),
    },
  };
}

/**
 * Nested child bindings (`logger.child({ creds: { password } })`) are the one
 * surface `formatters.log` cannot reach. Today's `*.password` covers them, so
 * closing this is what makes the prototype a strict superset rather than a
 * trade. Wrapping `child` costs one scrub of a small object per child.
 */
export function withScrubbedChildren<T extends Logger>(logger: T): T {
  const original = logger.child.bind(logger) as T["child"];
  const wrapped = ((bindings: Record<string, unknown>, opts?: unknown) =>
    withScrubbedChildren(
      original(scrub(bindings), opts as never) as T,
    )) as unknown as T["child"];
  logger.child = wrapped;
  return logger;
}
