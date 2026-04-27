import { db } from "../../config/database";
import { teams, standings, leagues } from "@dragons/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

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

export interface ReorderedTeam {
  id: number;
  name: string;
  displayOrder: number;
}

export async function reorderOwnClubTeams(
  teamIds: number[],
): Promise<ReorderedTeam[]> {
  // Reject duplicates
  const unique = new Set(teamIds);
  if (unique.size !== teamIds.length) {
    throw new Error("DUPLICATE_TEAM_ID");
  }

  return await db.transaction(async (tx) => {
    // Load current own-club team IDs
    const ownClub = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.isOwnClub, true));

    const ownClubIds = new Set(ownClub.map((t) => t.id));

    // Validate exact set match
    if (
      ownClubIds.size !== teamIds.length ||
      teamIds.some((id) => !ownClubIds.has(id))
    ) {
      throw new Error("INVALID_TEAM_SET");
    }

    // ::integer cast forces the bound parameter type — without it, node-postgres sends
    // the index as text and Postgres can't infer the column type inside CASE.
    const cases = teamIds
      .map((id, idx) => sql`WHEN ${id} THEN ${idx}::integer`)
      .reduce((acc, frag) => sql`${acc} ${frag}`);

    await tx
      .update(teams)
      .set({
        displayOrder: sql`CASE ${teams.id} ${cases} END`,
        updatedAt: new Date(),
      })
      .where(inArray(teams.id, teamIds));

    // Return the new ordered list
    const updated = await tx
      .select({
        id: teams.id,
        name: teams.name,
        displayOrder: teams.displayOrder,
      })
      .from(teams)
      .where(inArray(teams.id, teamIds));

    return updated.sort((a, b) => a.displayOrder - b.displayOrder);
  });
}
