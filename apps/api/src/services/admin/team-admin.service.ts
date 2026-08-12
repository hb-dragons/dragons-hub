import { getDb } from "../../config/database";
import { teams, teamEntries, standings, leagues } from "@dragons/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import type { OwnClubTeam, TeamReorderItem } from "@dragons/shared";
import { TeamReorderError } from "./team-admin.errors";
import { getActiveSeasonId } from "./season.service";

export type { OwnClubTeam, TeamReorderItem } from "@dragons/shared";

export async function getOwnClubTeams(seasonId?: number): Promise<OwnClubTeam[]> {
  const scopeId = seasonId !== undefined ? seasonId : await getActiveSeasonId();
  // No season to scope to means no entries; answering with an unscoped read is
  // exactly the bug this table replaced.
  if (scopeId === null) return [];

  const rows = await getDb()
    .select({
      id: teamEntries.id,
      teamId: teams.id,
      name: teams.name,
      nameShort: teams.nameShort,
      customName: teamEntries.customName,
      leagueId: teamEntries.leagueId,
      leagueName: leagues.name,
      leagueTracked: leagues.isTracked,
      linkSource: teamEntries.linkSource,
      estimatedGameDuration: teamEntries.estimatedGameDuration,
      badgeColor: teamEntries.badgeColor,
      displayOrder: teamEntries.displayOrder,
    })
    .from(teamEntries)
    .innerJoin(teams, eq(teamEntries.teamId, teams.id))
    .leftJoin(leagues, eq(teamEntries.leagueId, leagues.id))
    .where(and(eq(teamEntries.seasonId, scopeId), eq(teams.isOwnClub, true)));

  return rows
    .map((r) => ({
      ...r,
      linkSource: (r.linkSource === "manual" ? "manual" : "seeded") as "seeded" | "manual",
      leagueTracked: r.leagueId === null ? true : (r.leagueTracked ?? false),
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}

// Return type deliberately narrower than OwnClubTeam: this still updates the
// `teams` row (squad-level fields only), so it cannot populate the
// entry-scoped fields (teamId/leagueId/leagueTracked/linkSource). Task 5
// replaces this with `updateTeamEntry`, which returns the full shape.
export async function updateTeam(
  id: number,
  data: { customName?: string | null; estimatedGameDuration?: number | null; badgeColor?: string | null },
): Promise<Omit<OwnClubTeam, "teamId" | "leagueId" | "leagueTracked" | "linkSource"> | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.customName !== undefined) set.customName = data.customName;
  if (data.estimatedGameDuration !== undefined)
    set.estimatedGameDuration = data.estimatedGameDuration;
  if (data.badgeColor !== undefined) set.badgeColor = data.badgeColor;

  const [updated] = await getDb()
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
  const [standing] = await getDb()
    .select({ leagueName: leagues.name })
    .from(standings)
    .innerJoin(leagues, eq(leagues.id, standings.leagueId))
    .where(eq(standings.teamApiId, sql`(SELECT api_team_permanent_id FROM teams WHERE id = ${id})`))
    .limit(1);

  return { ...updated, leagueName: standing?.leagueName ?? null };
}

export async function reorderOwnClubTeams(
  teamIds: number[],
): Promise<TeamReorderItem[]> {
  // Reject duplicates
  const unique = new Set(teamIds);
  if (unique.size !== teamIds.length) {
    throw TeamReorderError.duplicateTeamId();
  }

  return await getDb().transaction(async (tx) => {
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
      throw TeamReorderError.invalidTeamSet();
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
