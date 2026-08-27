/**
 * The two paths a JS error can take out of the app: the runtime's global
 * handler, and the root error boundary (`components/ErrorBoundary.tsx`). Both
 * live here so they share one frame budget, one log format and one report
 * call.
 *
 * Only the boundary path reports here. The runtime's global handler is
 * already reported by the SDK: `Sentry.init` installs the
 * `ReactNativeErrorHandlers` integration, which patches
 * `ErrorUtils.setGlobalHandler` itself, marks the event `fatal` /
 * `handled: false`, and — this is the part worth not reimplementing —
 * `flush()`es it before handing on to RCTFatal. `installGlobalErrorHandler`
 * wraps *that* handler, so reporting again here would file every crash twice.
 *
 * Both paths keep writing the NSLog line, because it is the only trace
 * readable with no network and no account:
 * `idevicesyslog | grep DRAGONS_JS_ERROR`.
 *
 * Installation is a mount-time effect with a matching teardown rather than
 * module scope: fast refresh re-runs module scope, and a module-scope install
 * captures the previous — already wrapped — handler, so every refresh added
 * another layer and one error was logged once per refresh.
 */

import { reportCrash } from "./crash-reporting";

/** Stack frames kept in the log line; enough to place the throw, short enough to read. */
const STACK_FRAMES = 8;

/** One multi-line stack folded onto the single line NSLog can carry. */
function truncateFrames(frames: string | null | undefined): string | undefined {
  return frames?.split("\n").slice(0, STACK_FRAMES).join(" | ");
}

export function formatGlobalError(error: unknown, isFatal?: boolean): string {
  const err = error as Error | undefined;
  const stack = truncateFrames(err?.stack);
  return `DRAGONS_JS_ERROR fatal=${String(isFatal)} name=${err?.name} msg=${err?.message} stack=${stack}`;
}

/** Installs the handler and returns the function that restores its predecessor. */
export function installGlobalErrorHandler(): () => void {
  const previous = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.warn(formatGlobalError(error, isFatal));
    // `previous` is the SDK's handler once crash reporting is on (and the
    // runtime's own otherwise). It captures the error and flushes before
    // aborting, so nothing is reported here — see the note at the top.
    previous(error, isFatal);
  });

  return () => ErrorUtils.setGlobalHandler(previous);
}

export function formatBoundaryError(error: Error, componentStack?: string | null): string {
  const stack = truncateFrames(error.stack);
  const component = truncateFrames(componentStack);
  return `DRAGONS_JS_ERROR boundary=root name=${error.name} msg=${error.message} stack=${stack} component=${component}`;
}

/**
 * What the root error boundary does with an error it caught. A boundary error
 * is not fatal — React unmounted the tree and the fallback renders — so it is
 * reported at `error` level, with the component stack attached.
 */
export function handleBoundaryError(error: Error, componentStack?: string | null): void {
  console.warn(formatBoundaryError(error, componentStack));
  reportCrash(error, { source: "error-boundary", componentStack });
}
