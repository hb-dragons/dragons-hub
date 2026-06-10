/**
 * Wraps an async action so that concurrent callers share a single in-flight
 * run. Once the run settles (resolve or reject), the latch clears and the next
 * call starts a fresh run. Used to de-duplicate the 401 sign-out flow.
 */
export function createOnceGuard(action: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return () => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        await action();
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
