import { getDb } from "../../config/database";
import { matches, teams } from "@dragons/db/schema";
import { and, eq, gte, lte, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { startOfISOWeek, endOfISOWeek, setISOWeek, setYear, format } from "date-fns";

interface WeekendMatchesParams {
  type: "preview" | "results";
  week: number;
  year: number;
}

export interface SocialMatchItem {
  id: number;
  teamLabel: string;
  opponent: string;
  isHome: boolean;
  kickoffDate: string;
  kickoffTime: string;
  homeScore: number | null;
  guestScore: number | null;
}

function resolveTeamLabel(team: {
  customName: string | null;
  nameShort: string | null;
  name: string;
}): string {
  return team.customName || team.nameShort || team.name;
}

const homeTeam = alias(teams, "home_team");
const guestTeam = alias(teams, "guest_team");

export async function getWeekendMatches(
  params: WeekendMatchesParams,
): Promise<SocialMatchItem[]> {
  const { type, week, year } = params;

  const refDate = setISOWeek(setYear(new Date(year, 0, 4), year), week);
  const weekStart = startOfISOWeek(refDate);
  const weekEnd = endOfISOWeek(refDate);
  // Format in local time. toISOString() converts to UTC, which in a positive
  // offset zone (Europe/Berlin) rolls local-midnight Monday back to the previous
  // day, shifting the whole ISO-week window off by one against kickoffDate.
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");

  // A finished match has both scores; an upcoming one has neither. Gating only
  // on homeScore would miscategorise a row with a partial/one-sided score.
  const scoreCondition =
    type === "results"
      ? and(isNotNull(matches.homeScore), isNotNull(matches.guestScore))
      : and(isNull(matches.homeScore), isNull(matches.guestScore));

  const rows = await getDb()
    .select({
      match: {
        id: matches.id,
        homeTeamApiId: matches.homeTeamApiId,
        guestTeamApiId: matches.guestTeamApiId,
        kickoffDate: matches.kickoffDate,
        kickoffTime: matches.kickoffTime,
        homeScore: matches.homeScore,
        guestScore: matches.guestScore,
      },
      homeTeam: {
        apiTeamPermanentId: homeTeam.apiTeamPermanentId,
        customName: homeTeam.customName,
        nameShort: homeTeam.nameShort,
        name: homeTeam.name,
        isOwnClub: homeTeam.isOwnClub,
      },
      guestTeam: {
        apiTeamPermanentId: guestTeam.apiTeamPermanentId,
        customName: guestTeam.customName,
        nameShort: guestTeam.nameShort,
        name: guestTeam.name,
        isOwnClub: guestTeam.isOwnClub,
      },
    })
    .from(matches)
    .innerJoin(homeTeam, eq(matches.homeTeamApiId, homeTeam.apiTeamPermanentId))
    .innerJoin(
      guestTeam,
      eq(matches.guestTeamApiId, guestTeam.apiTeamPermanentId),
    )
    .where(
      and(
        gte(matches.kickoffDate, weekStartStr),
        lte(matches.kickoffDate, weekEndStr),
        scoreCondition,
      ),
    )
    .orderBy(matches.kickoffDate, matches.kickoffTime);

  return rows
    .filter((row) => (row.homeTeam.isOwnClub ?? false) || (row.guestTeam.isOwnClub ?? false))
    .map((row) => {
      const isHome = row.homeTeam.isOwnClub ?? false;
      const ownTeam = isHome ? row.homeTeam : row.guestTeam;
      const opponentTeam = isHome ? row.guestTeam : row.homeTeam;
      return {
        id: row.match.id,
        teamLabel: resolveTeamLabel(ownTeam),
        opponent: resolveTeamLabel(opponentTeam),
        isHome,
        kickoffDate: row.match.kickoffDate,
        kickoffTime: row.match.kickoffTime,
        homeScore: row.match.homeScore,
        guestScore: row.match.guestScore,
      };
    });
}
