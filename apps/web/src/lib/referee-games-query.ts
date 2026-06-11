import type { RefereeGamesQueryParams } from "@dragons/api-client";

/**
 * Caller-facing referee-games query options. `league` is an array here;
 * `normalizeRefereeGamesQuery` joins it to the comma-separated string the API
 * expects. Every field is optional — defaults are applied during normalization.
 */
export interface RawRefereeGamesOpts {
  // Deliberately narrower than RefereeGamesQueryParams.status: the referee-games
  // UI only queries active or all (never cancelled/forfeited).
  status?: "active" | "all";
  slotStatus?: "open" | "offered" | "any";
  league?: string[];
  dateFrom?: string;
  dateTo?: string;
  gameType?: "home" | "away" | "both";
  assignedRefereeApiId?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Normalized query: status/limit/offset defaults applied, `league` joined to a
 * string. Intersecting with RefereeGamesQueryParams makes this provably a valid
 * argument to `api.referees.getGames` and keeps it tracking the API contract.
 */
export type NormalizedRefereeGamesQuery = RefereeGamesQueryParams & {
  status: "active" | "all";
  limit: number;
  offset: number;
};

export function normalizeRefereeGamesQuery(
  opts: RawRefereeGamesOpts = {},
): NormalizedRefereeGamesQuery {
  return {
    status: opts.status ?? "active",
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
    ...(opts.slotStatus ? { slotStatus: opts.slotStatus } : {}),
    ...(opts.gameType ? { gameType: opts.gameType } : {}),
    ...(opts.dateFrom ? { dateFrom: opts.dateFrom } : {}),
    ...(opts.dateTo ? { dateTo: opts.dateTo } : {}),
    ...(opts.league?.length ? { league: opts.league.join(",") } : {}),
    ...(opts.search ? { search: opts.search } : {}),
    ...(opts.assignedRefereeApiId != null
      ? { assignedRefereeApiId: opts.assignedRefereeApiId }
      : {}),
  };
}
