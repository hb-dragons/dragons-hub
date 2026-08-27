import type { ReactNativeOptions } from "@sentry/react-native";

/**
 * What the running binary knows about where it came from. Passed in rather
 * than read here so this module stays free of native modules and the options
 * can be asserted in a plain node test.
 */
export interface CrashReportingRuntime {
  /** `EXPO_PUBLIC_GLITCHTIP_DSN`, inlined by Metro at build time. */
  dsn: string | undefined;
  /** `Updates.channel` — the EAS build profile's channel, "" outside EAS. */
  channel: string | null;
}

/** Environment reported when the build carries no EAS channel to name. */
const DEFAULT_ENVIRONMENT = "development";

/**
 * The `Sentry.init` options for this app, or `null` when crash reporting is
 * not configured.
 *
 * `null` is the normal state of a local checkout: the DSN is an EAS secret,
 * so a `pnpm start` bundle has none and must not open a socket to GlitchTip.
 * Returning options only when a DSN exists keeps that decision in one tested
 * place instead of an `if` at the call site.
 *
 * Release and dist are deliberately *not* set. The SDK derives both from the
 * native bundle, and the sentry-cli invocation the Expo plugin adds to the
 * build derives them the same way; overriding one side is the usual reason a
 * stack trace arrives unsymbolicated.
 */
export function crashReportingOptions(
  runtime: CrashReportingRuntime,
): ReactNativeOptions | null {
  const dsn = runtime.dsn?.trim();
  if (!dsn) return null;

  return {
    dsn,
    environment: runtime.channel?.trim() || DEFAULT_ENVIRONMENT,
    // GlitchTip is Sentry-API compatible for errors only: it implements
    // neither release health (sessions) nor tracing, so both would be
    // envelopes sent on every launch for an endpoint that discards them.
    enableAutoSessionTracking: false,
    tracesSampleRate: 0,
    enableNativeFramesTracking: false,
    // Art. 5(1)(c) DSGVO — the report carries the stack, not the person.
    sendDefaultPii: false,
  };
}
