import { getActiveSeasonId } from "./admin/season.service";

/** Run `fn` with the active season id, or return `empty` when there is no active season. */
export async function withActiveSeason<T>(
  fn: (seasonId: number) => Promise<T>,
  empty: T,
): Promise<T> {
  const seasonId = await getActiveSeasonId();
  if (seasonId === null) return empty;
  return fn(seasonId);
}
