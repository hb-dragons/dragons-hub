/**
 * Result channel for route sheets.
 *
 * A sheet that used to be a `<BottomSheetModal>` took its `onPick` callback
 * straight from the screen that opened it. A sheet that is a *route* cannot:
 * route params travel through the URL, so they carry strings, not closures.
 *
 * The convention (issue #219) is a token. The opening screen registers its
 * handler here, gets an opaque token back, and passes that token as the
 * `result` route param. The sheet reads the param and calls
 * `deliverSheetResult` with the picked value; the handler runs on the screen
 * that is still mounted underneath, exactly as before.
 *
 * Two rules keep the table from growing without bound:
 *  - delivery is single-shot — the token is dropped as it fires;
 *  - a sheet that closes without delivering (swipe-dismiss, Cancel) releases
 *    its token from a route unmount effect.
 */

type SheetResultHandler = (value: never) => void;

const handlers = new Map<string, SheetResultHandler>();

let sequence = 0;

/**
 * Register `onResult` and return the token to pass as the `result` route
 * param. Not a random id: `Math.random` is avoided so the token sequence stays
 * reproducible across a session.
 */
export function createSheetResult<T>(onResult: (value: T) => void): string {
  sequence += 1;
  const token = `sheet-${sequence}`;
  handlers.set(token, onResult as SheetResultHandler);
  return token;
}

/**
 * Hand `value` to the token's handler. Returns whether a handler was found —
 * `false` for an absent, unknown or already-delivered token, which is the
 * normal outcome when a sheet route is reopened from a cold deep link and its
 * `result` param is stale.
 */
export function deliverSheetResult<T>(token: string | undefined, value: T): boolean {
  if (!token) return false;
  const handler = handlers.get(token);
  if (!handler) return false;
  handlers.delete(token);
  (handler as (v: T) => void)(value);
  return true;
}

/** Drop a token whose sheet closed without producing a result. */
export function releaseSheetResult(token: string | undefined): void {
  if (token) handlers.delete(token);
}

/** Outstanding registrations. Exists so tests can assert nothing leaks. */
export function pendingSheetResultCount(): number {
  return handlers.size;
}

/** Exported for testing only — clears the table between cases. */
export function __resetSheetResultsForTests(): void {
  handlers.clear();
  sequence = 0;
}
