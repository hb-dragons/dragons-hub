/**
 * One push-token registration per session (#253).
 *
 * `registerForPush` is idempotent — the server upserts by token, and the call
 * is a no-op unless the OS reports `granted`. But the app calls it on every
 * return to the foreground so a permission granted in iOS Settings takes
 * effect without a relaunch, and that listener fires on notification-banner
 * taps and control-centre swipes too. Each of those walked the permission
 * check and, once granted, the token fetch and the API call.
 *
 * This tracker keeps the Settings path working while paying for it once: it
 * retries as long as registration reports it did nothing (not a device, no
 * projectId, permission not granted, the token fetch failed) and stops asking
 * the moment a token has actually reached the API. A rejected call does not
 * latch either. Concurrent calls share one in-flight promise, so a burst of
 * foreground transitions cannot stack registrations.
 *
 * The tracker's lifetime is the signed-in session: `usePushRegistration`
 * creates a new one per user id, so signing in as somebody else registers the
 * device again for the new account.
 */
export interface SessionRegistration {
  /** Register unless this session already has, awaiting any call in flight. */
  ensure: () => Promise<void>;
}

export function createSessionRegistration(
  register: () => Promise<boolean>,
): SessionRegistration {
  let registered = false;
  let inFlight: Promise<void> | null = null;

  const ensure = async (): Promise<void> => {
    if (registered) return;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        registered = await register();
      } catch (err) {
        // Callers fire this from an AppState listener and cannot await it, so
        // a rejection here would surface as an unhandled one. Not latching is
        // the whole recovery: the next foreground tries again.
        console.warn("[push] session registration failed", err);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  return { ensure };
}
