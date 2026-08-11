import { getActiveSeasonId } from "./admin/season.service";

/**
 * Season id standing for "there is no active season".
 *
 * `seasons.id` is a serial, so no row can ever carry it and a query scoped to
 * it matches nothing. That is the correct public answer before anyone has
 * activated a season: show an empty schedule, not every season at once. Callers
 * that must not fall back to unscoped reads use `... ?? NO_SEASON`.
 */
export const NO_SEASON = -1;

/** Run `fn` with the active season id, or return `empty` when there is no active season. */
export async function withActiveSeason<T>(
  fn: (seasonId: number) => Promise<T>,
  empty: T,
): Promise<T> {
  const seasonId = await getActiveSeasonId();
  if (seasonId === null) return empty;
  return fn(seasonId);
}
