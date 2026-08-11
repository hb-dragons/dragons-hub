import { AppState, type AppStateStatus } from "react-native";

/**
 * Grace period (ms) between the app entering `background` and the user
 * returning to it before the biometric lock re-arms. Kept at `0` — i.e. any
 * genuine backgrounding re-locks immediately — because this gate is a
 * security control, not a UX nicety: an attacker who picks up an unattended
 * phone should never get a free window. Callers may pass a longer value
 * (e.g. to tolerate a system photo/document picker briefly backgrounding the
 * app) but must opt into that trade-off explicitly.
 */
export const DEFAULT_RELOCK_GRACE_PERIOD_MS = 0;

/**
 * iOS reports `inactive` for transient UI that never actually hides the app
 * (app-switcher preview, control center, an incoming call banner, the share
 * sheet). The app is still fully resident and the user never left it, so
 * treating `inactive` as a real departure would re-lock on every glance and
 * make the app unusable. `background` is the only state that means the app
 * was actually hidden from the user.
 */
export function didEnterBackground(previous: AppStateStatus, next: AppStateStatus): boolean {
  return next === "background" && previous !== "background";
}

export function didReturnFromBackground(previous: AppStateStatus, next: AppStateStatus): boolean {
  return previous === "background" && next === "active";
}

/**
 * Subscribes to `AppState` and invokes `onRelock` when the app returns to
 * `active` after having genuinely been `background`ed for at least
 * `gracePeriodMs`. Returns an unsubscribe function.
 *
 * If the app is observed returning to `active` from `background` without a
 * recorded backgrounding timestamp (e.g. the listener attached mid-flight),
 * it fails closed and relocks unconditionally — the safe default when the
 * true elapsed time is unknown.
 */
export function subscribeBackgroundRelock(params: {
  onRelock: () => void;
  gracePeriodMs?: number;
  now?: () => number;
}): () => void {
  const gracePeriodMs = params.gracePeriodMs ?? DEFAULT_RELOCK_GRACE_PERIOD_MS;
  const now = params.now ?? Date.now;

  let previousState: AppStateStatus = AppState.currentState;
  let backgroundedAt: number | null = null;

  const subscription = AppState.addEventListener("change", (nextState) => {
    if (didEnterBackground(previousState, nextState)) {
      backgroundedAt = now();
    } else if (didReturnFromBackground(previousState, nextState)) {
      const elapsed = backgroundedAt === null ? Number.POSITIVE_INFINITY : now() - backgroundedAt;
      if (elapsed >= gracePeriodMs) {
        params.onRelock();
      }
      backgroundedAt = null;
    }
    previousState = nextState;
  });

  return () => subscription.remove();
}
