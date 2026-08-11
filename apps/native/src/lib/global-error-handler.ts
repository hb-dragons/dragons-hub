/**
 * Global JS error handler.
 *
 * Logs to NSLog *before* RCTFatal aborts the app in Release builds, which is
 * the only trace a released crash leaves today. Read it back with
 * `idevicesyslog | grep DRAGONS_JS_ERROR`.
 *
 * Installation is a mount-time effect with a matching teardown rather than
 * module scope: fast refresh re-runs module scope, and a module-scope install
 * captures the previous — already wrapped — handler, so every refresh added
 * another layer and one error was logged once per refresh.
 */

/** Stack frames kept in the log line; enough to place the throw, short enough to read. */
const STACK_FRAMES = 8;

export function formatGlobalError(error: unknown, isFatal?: boolean): string {
  const err = error as Error | undefined;
  const stack = err?.stack?.split("\n").slice(0, STACK_FRAMES).join(" | ");
  return `DRAGONS_JS_ERROR fatal=${String(isFatal)} name=${err?.name} msg=${err?.message} stack=${stack}`;
}

/** Installs the handler and returns the function that restores its predecessor. */
export function installGlobalErrorHandler(): () => void {
  const previous = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.warn(formatGlobalError(error, isFatal));
    previous(error, isFatal);
  });

  return () => ErrorUtils.setGlobalHandler(previous);
}
