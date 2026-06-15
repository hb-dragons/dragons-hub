/**
 * Client-side clock interpolation for the broadcast overlay. The server now
 * sends a broadcast event only on a real change, so the overlay advances the
 * game + shot clock locally between events, re-anchoring on each event. Both
 * clocks are driven off the reliable `clockRunning` flag (the per-frame
 * shotClockRunning flag is best-effort and ignored). Pure + framework-free so
 * it is unit-testable in the node/happy-dom suite.
 */

/** Freeze + dim after this long without an event (matches the server stale window). */
export const STALE_MS = 30_000;

export interface ClockAnchor {
  clockMs: number | null;
  clockText: string; // server value, used as the fallback when not interpolating
  shotClock: number | null;
  shotClockText: string; // server value, used as the fallback
  clockRunning: boolean;
  timeoutActive: boolean;
  anchorAt: number; // performance.now() captured at SSE receipt
}

/** "MM:SS" at/above a minute (ceil whole seconds); "S.t" below (floor to a tenth). */
export function formatGameClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped >= 60_000) {
    const total = Math.ceil(clamped / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  const tenths = Math.floor(clamped / 100);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

/** ">=5" whole seconds (ceil); "S.t" tenths under 5; "0" at expiry. */
export function formatShotClock(value: number): string {
  const v = Math.max(0, value);
  if (v >= 5) return String(Math.ceil(v));
  const tenths = Math.floor(v * 10);
  if (tenths <= 0) return "0";
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

export function isStale(anchor: ClockAnchor, now: number): boolean {
  return now - anchor.anchorAt > STALE_MS;
}

export function interpolate(
  anchor: ClockAnchor,
  now: number,
): { clockText: string; shotClockText: string } {
  const elapsed = Math.max(0, (now - anchor.anchorAt) / 1000); // seconds

  let clockText = anchor.clockText;
  if (anchor.clockRunning && anchor.clockMs != null) {
    clockText = formatGameClock(anchor.clockMs - elapsed * 1000);
  }

  let shotClockText = anchor.shotClockText;
  if (anchor.clockRunning && !anchor.timeoutActive && anchor.shotClock != null) {
    shotClockText = formatShotClock(anchor.shotClock - elapsed);
  }

  return { clockText, shotClockText };
}
