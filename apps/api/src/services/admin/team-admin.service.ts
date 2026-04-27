import { db } from "../../config/database";
import { teams, standings, leagues } from "@dragons/db/schema";
import { eq, and, sql } from "drizzle-orm";

export interface OwnClubTeam {
  id: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  leagueName: string | null;
  estimatedGameDuration: number | null;
  badgeColor: string | null;
  displayOrder: number;
}

export async function getOwnClubTeams(): Promise<OwnClubTeam[]> {
  const rows = await db
    .selectDistinctOn([teams.id], {
      id: teams.id,
      name: teams.name,
      nameShort: teams.nameShort,
      customName: teams.customName,
      leagueName: leagues.name,
      estimatedGameDuration: teams.estimatedGameDuration,
      badgeColor: teams.badgeColor,
      displayOrder: teams.displayOrder,
    })
    .from(teams)
    .leftJoin(standings, eq(standings.teamApiId, teams.apiTeamPermanentId))
    .leftJoin(leagues, eq(leagues.id, standings.leagueId))
    .where(eq(teams.isOwnClub, true))
    .orderBy(teams.id, sql`${leagues.name} ASC NULLS LAST`);

  return rows.sort(
    (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
  );
}

export async function updateTeam(
  id: number,
  data: { customName?: string | null; estimatedGameDuration?: number | null; badgeColor?: string | null },
): Promise<OwnClubTeam | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.customName !== undefined) set.customName = data.customName;
  if (data.estimatedGameDuration !== undefined)
    set.estimatedGameDuration = data.estimatedGameDuration;
  if (data.badgeColor !== undefined) set.badgeColor = data.badgeColor;

  const [updated] = await db
    .update(teams)
    .set(set)
    .where(and(eq(teams.id, id), eq(teams.isOwnClub, true)))
    .returning({
      id: teams.id,
      name: teams.name,
      nameShort: teams.nameShort,
      customName: teams.customName,
      estimatedGameDuration: teams.estimatedGameDuration,
      badgeColor: teams.badgeColor,
      displayOrder: teams.displayOrder,
    });

  if (!updated) return null;

  // Fetch league name for the updated team
  const [standing] = await db
    .select({ leagueName: leagues.name })
    .from(standings)
    .innerJoin(leagues, eq(leagues.id, standings.leagueId))
    .where(eq(standings.teamApiId, sql`(SELECT api_team_permanent_id FROM teams WHERE id = ${id})`))
    .limit(1);

  return { ...updated, leagueName: standing?.leagueName ?? null };
}
