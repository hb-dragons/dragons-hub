export const SCOREBOARD_ONLINE_THRESHOLD_MS = 10_000;
export const BROADCAST_STALE_THRESHOLD_MS = 30_000;

export function computeSecondsSince(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const ms = typeof date === "string" ? Date.parse(date) : date.getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 1000));
}
