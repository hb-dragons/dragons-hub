export type SeasonStatus = "upcoming" | "active" | "archived";

export const SEASON_STATUSES: readonly SeasonStatus[] = [
  "upcoming",
  "active",
  "archived",
] as const;

export interface Season {
  id: number;
  name: string;
  sdkSeasonId: number | null;
  status: SeasonStatus;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeasonWithCounts extends Season {
  leagueCount: number;
  /** Fixtures pulled for this season's leagues — 0 until the sync has run. */
  gameCount: number;
}

export interface BrowsableLeague {
  ligaId: number;
  ligaNr: number | null;
  name: string;
  skName: string;
  akName: string;
  geschlecht: string;
  vorabliga: boolean;
  alreadyTracked: boolean;
  /**
   * Name of the season that already owns this liga's league row, or `null` when
   * no other season does. Picking a flagged liga is refused rather than allowed
   * to move the row (see `LeagueSeasonConflict`), so the picker says so up front.
   */
  conflictSeasonName: string | null;
}

/**
 * A selected liga whose league row already belongs to a different season. The
 * federation is expected to mint a fresh liga ID per season; when one is reused
 * the row cannot be re-scoped, because matches, standings and team entries all
 * hang off it and would follow it into the new season.
 */
export interface LeagueSeasonConflict {
  ligaId: number;
  name: string;
  ownedBySeasonId: number;
  ownedBySeasonName: string;
}

export interface SetSeasonLeaguesResult {
  tracked: number;
  untracked: number;
  entriesSeeded: number;
  rosterFailures: number[];
  /** Selected ligas that were skipped because another season owns the row. */
  conflicts: LeagueSeasonConflict[];
}

export interface SeasonSummary {
  leagueCount: number;
  gameCount: number;
  /**
   * Fixture slots the federation has not yet assigned a team to. `null` when
   * the federation could not be read — a partial count is indistinguishable
   * from a genuinely low one, so we report nothing rather than a wrong number.
   */
  placeholderSlots: number | null;
}
