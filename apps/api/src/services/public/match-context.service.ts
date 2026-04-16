import { db } from "../../config/database";
import { matches, teams } from "@dragons/db/schema";
import { eq, and, or, desc, isNotNull } from "drizzle-orm";
import type { MatchContext, FormEntry, PreviousMeeting } from "@dragons/shared";

export async function getMatchContext(matchId: number): Promise<MatchContext | null> {
  const [match] = await db
    .select({ homeTeamApiId: matches.homeTeamApiId, guestTeamApiId: matches.guestTeamApiId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) return null;

  const { homeTeamApiId, guestTeamApiId } = match;

  const h2hMatches = await db
    .select({
      id: matches.id,
      kickoffDate: matches.kickoffDate,
      homeTeamApiId: matches.homeTeamApiId,
      guestTeamApiId: matches.guestTeamApiId,
      homeScore: matches.homeScore,
      guestScore: matches.guestScore,
    })
    .from(matches)
    .where(
      and(
        isNotNull(matches.homeScore),
        isNotNull(matches.guestScore),
        or(
          and(eq(matches.homeTeamApiId, homeTeamApiId), eq(matches.guestTeamApiId, guestTeamApiId)),
          and(eq(matches.homeTeamApiId, guestTeamApiId), eq(matches.guestTeamApiId, homeTeamApiId)),
        ),
      ),
    )
    .orderBy(desc(matches.kickoffDate));

  const [homeTeamRow] = await db
    .select({ isOwnClub: teams.isOwnClub, name: teams.name })
    .from(teams)
    .where(eq(teams.apiTeamPermanentId, homeTeamApiId))
    .limit(1);

  const [guestTeamRow] = await db
    .select({ isOwnClub: teams.isOwnClub, name: teams.name })
    .from(teams)
    .where(eq(teams.apiTeamPermanentId, guestTeamApiId))
    .limit(1);

  const ourTeamApiId = homeTeamRow?.isOwnClub ? homeTeamApiId : guestTeamApiId;

  let wins = 0, losses = 0, pointsFor = 0, pointsAgainst = 0;
  const previousMeetings: PreviousMeeting[] = [];

  for (const m of h2hMatches) {
    const ourScore = m.homeTeamApiId === ourTeamApiId ? m.homeScore! : m.guestScore!;
    const theirScore = m.homeTeamApiId === ourTeamApiId ? m.guestScore! : m.homeScore!;
    const isWin = ourScore > theirScore;
    if (isWin) wins++; else losses++;
    pointsFor += ourScore;
    pointsAgainst += theirScore;
    if (previousMeetings.length < 5) {
      // Resolve names based on actual positions in THIS meeting, not the current match
      const sameOrder = m.homeTeamApiId === homeTeamApiId;
      previousMeetings.push({
        matchId: m.id,
        date: m.kickoffDate,
        homeTeamName: sameOrder ? (homeTeamRow?.name ?? "") : (guestTeamRow?.name ?? ""),
        guestTeamName: sameOrder ? (guestTeamRow?.name ?? "") : (homeTeamRow?.name ?? ""),
        homeScore: m.homeScore!,
        guestScore: m.guestScore!,
        isWin,
        homeIsOwnClub: m.homeTeamApiId === ourTeamApiId,
      });
    }
  }

  const homeForm = await getTeamForm(homeTeamApiId);
  const guestForm = await getTeamForm(guestTeamApiId);

  return {
    headToHead: { wins, losses, pointsFor, pointsAgainst, previousMeetings },
    homeForm,
    guestForm,
  };
}

async function getTeamForm(teamApiId: number): Promise<FormEntry[]> {
  const recent = await db
    .select({
      id: matches.id,
      homeTeamApiId: matches.homeTeamApiId,
      homeScore: matches.homeScore,
      guestScore: matches.guestScore,
    })
    .from(matches)
    .where(
      and(
        isNotNull(matches.homeScore),
        isNotNull(matches.guestScore),
        or(eq(matches.homeTeamApiId, teamApiId), eq(matches.guestTeamApiId, teamApiId)),
      ),
    )
    .orderBy(desc(matches.kickoffDate))
    .limit(5);

  return recent.map((m) => {
    const isHome = m.homeTeamApiId === teamApiId;
    const ourScore = isHome ? m.homeScore! : m.guestScore!;
    const theirScore = isHome ? m.guestScore! : m.homeScore!;
    return { result: ourScore > theirScore ? "W" as const : "L" as const, matchId: m.id };
  });
}
