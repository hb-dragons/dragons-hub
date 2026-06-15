/**
 * The fields that, when they change, the overlay must see immediately. A plain
 * countdown decrement of either clock is NOT relevant — the overlay
 * interpolates those locally. See the overlay clock-interpolation design.
 */
export interface BroadcastChangeFields {
  scoreHome: number;
  scoreGuest: number;
  foulsHome: number;
  foulsGuest: number;
  timeoutsHome: number;
  timeoutsGuest: number;
  period: number;
  clockRunning: boolean;
  timeoutActive: boolean;
  clockSeconds: number | null;
  shotClock: number | null;
}

// shotClock is a float (fractional under 5 s); guard equality with an epsilon.
const SHOT_EPS = 0.01;

const DISCRETE_KEYS = [
  "scoreHome",
  "scoreGuest",
  "foulsHome",
  "foulsGuest",
  "timeoutsHome",
  "timeoutsGuest",
  "period",
  "clockRunning",
  "timeoutActive",
] as const satisfies ReadonlyArray<keyof BroadcastChangeFields>;

export function broadcastRelevantChange(
  prev: BroadcastChangeFields | null,
  next: BroadcastChangeFields,
): boolean {
  if (!prev) return true;
  if (DISCRETE_KEYS.some((k) => prev[k] !== next[k])) return true;

  // Shot clock: a reset is an increase; on/off is a null toggle. Decrements are
  // interpolated, so they are not relevant.
  if ((prev.shotClock == null) !== (next.shotClock == null)) return true;
  if (
    prev.shotClock != null &&
    next.shotClock != null &&
    next.shotClock > prev.shotClock + SHOT_EPS
  ) {
    return true;
  }

  // Game clock: a referee correction or period reset is an increase or a null
  // toggle. Decrements are interpolated. clockSeconds is whole integer seconds
  // (the decoder floors it), so no epsilon is needed here.
  if ((prev.clockSeconds == null) !== (next.clockSeconds == null)) return true;
  if (
    prev.clockSeconds != null &&
    next.clockSeconds != null &&
    next.clockSeconds > prev.clockSeconds
  ) {
    return true;
  }

  return false;
}
