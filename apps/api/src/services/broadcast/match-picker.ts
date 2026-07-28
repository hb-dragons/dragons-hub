import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../../config/database";
import { matches, leagues, teams } from "@dragons/db/schema";
import { escapeLikePattern } from "../utils/sql";

const homeTeam = alias(teams, "home_team");
const guestTeam = alias(teams, "guest_team");

export interface BroadcastableMatch {
  id: number;
  kickoffDate: string;
  kickoffTime: string;
  homeName: string | null;
  guestName: string | null;
  leagueName: string | null;
}

/**
 * Own-club matches available for broadcast binding (admin match picker).
 * `scope: "today"` narrows to today's kickoff date (UTC-sliced, matching the
 * rest of this query's date handling — not timezone-aware); anything else
 * (including "all" or omitted) leaves every date in scope. `q` does a
 * case-insensitive substring match against team name/short name, LIKE
 * metacharacters escaped so a literal "%" or "_" in a search term can't be
 * read as a wildcard.
 */
export async function listBroadcastableMatches(opts: {
  q?: string;
  scope?: "today" | "all";
}): Promise<BroadcastableMatch[]> {
  const { q, scope } = opts;
  const today = new Date().toISOString().slice(0, 10);

  const ownIds = await getDb()
    .select({ id: teams.apiTeamPermanentId })
    .from(teams)
    .where(eq(teams.isOwnClub, true));
  const ownIdValues = ownIds.map((r) => r.id);
  if (ownIdValues.length === 0) {
    return [];
  }

  const ownClubFilter = or(
    inArray(matches.homeTeamApiId, ownIdValues),
    inArray(matches.guestTeamApiId, ownIdValues),
  );

  let dateFilter = undefined;
  if (scope === "today") {
    dateFilter = eq(matches.kickoffDate, today);
  }

  let textFilter = undefined;
  if (q && q.trim().length > 0) {
    const pattern = `%${escapeLikePattern(q.trim())}%`;
    const matchedTeams = await getDb()
      .select({ id: teams.apiTeamPermanentId })
      .from(teams)
      .where(or(ilike(teams.name, pattern), ilike(teams.nameShort, pattern)));
    const matchedIds = matchedTeams.map((r) => r.id);
    if (matchedIds.length === 0) {
      return [];
    }
    textFilter = or(
      inArray(matches.homeTeamApiId, matchedIds),
      inArray(matches.guestTeamApiId, matchedIds),
    );
  }

  const filters = [ownClubFilter];
  if (dateFilter) filters.push(dateFilter);
  if (textFilter) filters.push(textFilter);

  return getDb()
    .select({
      id: matches.id,
      kickoffDate: matches.kickoffDate,
      kickoffTime: matches.kickoffTime,
      homeName: homeTeam.name,
      guestName: guestTeam.name,
      leagueName: leagues.name,
    })
    .from(matches)
    .leftJoin(homeTeam, eq(matches.homeTeamApiId, homeTeam.apiTeamPermanentId))
    .leftJoin(guestTeam, eq(matches.guestTeamApiId, guestTeam.apiTeamPermanentId))
    .leftJoin(leagues, eq(matches.leagueId, leagues.id))
    .where(and(...filters))
    .orderBy(asc(matches.kickoffDate), asc(matches.kickoffTime))
    .limit(100);
}
