import * as Sentry from "@sentry/react-native";
import * as Updates from "expo-updates";
import { crashReportingOptions } from "./options";

/**
 * Crash reporting for release builds, sent to the club's GlitchTip project
 * (issue #238).
 *
 * GlitchTip speaks the Sentry ingest API, so the client is `@sentry/react-native`
 * pointed at `eu.glitchtip.com` — the EU instance in Frankfurt, which keeps the
 * whole flow inside the EU and out of the Datenschutzerklärung's third-country
 * section. What GlitchTip does not implement is switched off in `options.ts`.
 *
 * Every entry point here is failure-tolerant on purpose: this module runs on
 * the path where the app is *already* crashing, and a throw from the reporter
 * would replace a symbolicated stack with a stack pointing at the reporter.
 */

export interface CrashContext {
  /**
   * Where the report came from; becomes the `source` tag on the issue, which
   * is what separates these from the events the SDK's own `onerror` handler
   * files. Only the error boundary reports by hand — the global handler's
   * errors are the SDK's to send (see `lib/error-reporting.ts`).
   */
  source: "error-boundary";
  /** React's component stack, when an error boundary caught the error. */
  componentStack?: string | null;
}

/**
 * Starts the SDK, if this build has a DSN to start it with — see
 * `crashReportingOptions` for when it does not.
 */
export function initCrashReporting(): void {
  const options = crashReportingOptions({
    dsn: process.env.EXPO_PUBLIC_GLITCHTIP_DSN,
    channel: Updates.channel,
  });
  if (!options) return;

  try {
    Sentry.init(options);
  } catch (err) {
    // A missing native module (Expo Go, a stale prebuild) must not take the
    // app down on the first line of the first render.
    console.warn("[crash-reporting] init failed", err);
  }
}

/** Sends one error to GlitchTip. A no-op when the SDK was never started. */
export function reportCrash(error: unknown, context: CrashContext): void {
  if (!Sentry.getClient()) return;

  try {
    Sentry.captureException(error, {
      // Never fatal: everything reaching here was caught by a boundary, so
      // React unmounted the tree, the fallback rendered and the app lives.
      level: "error",
      tags: { source: context.source },
      contexts: context.componentStack
        ? { react: { componentStack: context.componentStack } }
        : {},
    });
  } catch (err) {
    console.warn("[crash-reporting] capture failed", err);
  }
}
