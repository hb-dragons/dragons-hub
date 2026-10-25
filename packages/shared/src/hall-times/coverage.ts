import type { HallTimeCoverage, HallTimeInput } from "../hall-times";

export interface CoverageResult {
  status: HallTimeCoverage;
  /** Minutes the window starts before the hall time; 0 unless partial. */
  gapBeforeMinutes: number;
  /** Minutes the window ends after the hall time; 0 unless partial. */
  gapAfterMinutes: number;
}

/** "HH:mm" or "HH:mm:ss" → minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/**
 * How a home game day's programme window sits against the hall time of its
 * day. The window already carries the buffers before the first and after the
 * last game, so it is what the club would write on the Anlage T; `covered`
 * means nothing more to request.
 */
export function coverageFor(
  window: { start: string; end: string },
  hallTime: Pick<HallTimeInput, "kind" | "startTime" | "endTime"> | null,
): CoverageResult {
  const none = { gapBeforeMinutes: 0, gapAfterMinutes: 0 };
  if (!hallTime) return { status: "none", ...none };
  if (hallTime.kind === "closed" || !hallTime.startTime || !hallTime.endTime) {
    return { status: "closed", ...none };
  }
  const ws = timeToMinutes(window.start);
  const we = timeToMinutes(window.end);
  const hs = timeToMinutes(hallTime.startTime);
  const he = timeToMinutes(hallTime.endTime);
  if (we <= hs || ws >= he) return { status: "uncovered", ...none };
  const gapBeforeMinutes = Math.max(0, hs - ws);
  const gapAfterMinutes = Math.max(0, we - he);
  if (gapBeforeMinutes === 0 && gapAfterMinutes === 0) return { status: "covered", ...none };
  return { status: "partial", gapBeforeMinutes, gapAfterMinutes };
}
