import type { LeagueStandings } from "./standings";

/**
 * Resolve the league table a team appears in.
 *
 * Team display names are not unique: the federation ships several squads with
 * the same name (five youth squads share the short name "DRAG1", and the U18
 * squad's full name is a prefix of the Damen 1 squad's). Matching a standings
 * row by name therefore picked whichever league listed a name-alike first,
 * which is how a U12 detail page ended up showing the U14 table. `teamApiId`
 * is the permanent id the federation keys a squad by — match on that.
 */
export function findLeagueStandingsForTeam<T extends LeagueStandings>(
  leagues: readonly T[] | null | undefined,
  teamApiId: number | null | undefined,
): T | null {
  if (!leagues || teamApiId == null) return null;
  for (const league of leagues) {
    for (const standing of league.standings) {
      if (standing.teamApiId === teamApiId) return league;
    }
  }
  return null;
}

/**
 * Index teams by their permanent api id — the key a standings row, a match and
 * a head-to-head route all address a squad by. First row wins on a duplicate,
 * so the map never depends on list order beyond that.
 */
export function buildTeamsByApiId<T extends { apiTeamPermanentId: number }>(
  teams: readonly T[] | null | undefined,
): Map<number, T> {
  const map = new Map<number, T>();
  for (const team of teams ?? []) {
    if (!map.has(team.apiTeamPermanentId)) map.set(team.apiTeamPermanentId, team);
  }
  return map;
}
