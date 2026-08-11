/**
 * Trailing-edge debouncer.
 *
 * Search inputs used to push every keystroke straight into an SWR key. Because
 * each key is distinct, SWR's `dedupingInterval` cannot collapse them, so
 * typing "Schmidt" fired seven requests — one of those searches is a live
 * federation call.
 *
 * The debouncer owns one pending timer: scheduling again supersedes whatever
 * was pending, so only the last callback in a burst runs.
 */

/** Pause after the last keystroke before a search request goes out. */
export const SEARCH_DEBOUNCE_MS = 250;

export interface Debouncer {
  /** Replace any pending callback with this one, to run in `delayMs`. */
  schedule: (run: () => void, delayMs: number) => void;
  /** Drop the pending callback, if any. */
  cancel: () => void;
}

export function createDebouncer(): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    cancel,
    schedule(run, delayMs) {
      cancel();
      // A zero/negative delay means "no debounce" — run now rather than
      // deferring to a macrotask, so clearing a search feels instant.
      if (delayMs <= 0) {
        run();
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        run();
      }, delayMs);
    },
  };
}
