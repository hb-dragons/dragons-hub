import type { LeagueStandings, StandingItem } from "@dragons/shared";

/**
 * Adapter between the public standings shape (`/public/standings`,
 * `@dragons/shared` `LeagueStandings`) and the legacy team-page table
 * (dragons-app `app/components/teams/Standings.vue`): `position` →
 * `rank`, `leaguePoints` → `points`, `played/won/lost` → `games/wins/losses`,
 * `verzicht` → `resigned` — plan Task C5 Step 4.
 */

/**
 * A standings row as the deployed API serves it. `verzicht` is optional here
 * although `StandingItem` declares it required: the flag ships with plan Task
 * B2 and the live API may lag a deploy behind — a missing flag must degrade
 * to "not withdrawn", never crash the island.
 */
export type PublicStandingItem = Omit<StandingItem, "verzicht"> & { verzicht?: boolean };

export type PublicLeagueStandings = Omit<LeagueStandings, "standings"> & {
  standings: PublicStandingItem[];
};

/**
 * The row slice `toStandingRows` reads — satisfied by the runtime
 * `PublicStandingItem` and by the build-time rows in src/lib/team-league.ts,
 * so the Tabelle tab adapts both through one function.
 */
export interface StandingRowInput {
  position: number;
  teamApiId: number;
  teamName: string;
  played: number;
  won: number;
  lost: number;
  leaguePoints: number;
  pointsFor: number;
  pointsAgainst: number;
  verzicht?: boolean;
}

/** The legacy `StandingItem` row shape the table renders. */
export interface LegacyStandingRow {
  rank: number;
  name: string;
  games: number;
  wins: number;
  losses: number;
  points: number;
  pointsFor: number;
  pointsAgainst: number;
  resigned: boolean;
}

/**
 * The league a team plays in, found by its `apiTeamPermanentId` join key —
 * the legacy CMS stored a `leagueId` per team; the public shape carries the
 * membership in the standings rows instead, so no extra CMS field is needed.
 */
export function findTeamLeague<T extends { standings: { teamApiId: number }[] }>(
  leagues: readonly T[],
  teamApiId: number | null | undefined,
): T | null {
  if (teamApiId == null) return null;
  return leagues.find((league) => league.standings.some((row) => row.teamApiId === teamApiId)) ?? null;
}

/** Adapts one league's rows to the legacy naming, in API (position) order. */
export function toStandingRows(league: {
  standings: readonly StandingRowInput[];
}): LegacyStandingRow[] {
  return league.standings.map((row) => ({
    rank: row.position,
    name: row.teamName,
    games: row.played,
    wins: row.won,
    losses: row.lost,
    points: row.leaguePoints,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    resigned: row.verzicht ?? false,
  }));
}
