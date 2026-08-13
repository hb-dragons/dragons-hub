import { getDb } from "../../config/database";
import { teams, teamEntries, leagues } from "@dragons/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import type { OwnClubTeam, TeamReorderItem } from "@dragons/shared";
import { TeamReorderError, TeamLeagueMismatchError } from "./team-admin.errors";
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

export async function updateTeamEntry(
  entryId: number,
  data: {
    customName?: string | null;
    estimatedGameDuration?: number | null;
    badgeColor?: string | null;
    leagueId?: number | null;
  },
): Promise<OwnClubTeam | null> {
  const db = getDb();
  const [entry] = await db
    .select({ id: teamEntries.id, seasonId: teamEntries.seasonId })
    .from(teamEntries)
    .innerJoin(teams, eq(teamEntries.teamId, teams.id))
    .where(and(eq(teamEntries.id, entryId), eq(teams.isOwnClub, true)));
  if (!entry) return null;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.customName !== undefined) set.customName = data.customName;
  if (data.estimatedGameDuration !== undefined) set.estimatedGameDuration = data.estimatedGameDuration;
  if (data.badgeColor !== undefined) set.badgeColor = data.badgeColor;
  if (data.leagueId !== undefined) {
    if (data.leagueId !== null) {
      const [league] = await db
        .select({ id: leagues.id })
        .from(leagues)
        .where(and(eq(leagues.id, data.leagueId), eq(leagues.seasonRefId, entry.seasonId)));
      if (!league) throw new TeamLeagueMismatchError(entryId, data.leagueId);
    }
    set.leagueId = data.leagueId;
    set.linkSource = "manual";
  }

  await db.update(teamEntries).set(set).where(eq(teamEntries.id, entryId));
  const [row] = await getOwnClubTeamsById(entryId, entry.seasonId);
  return row ?? null;
}

/** One entry, in the exact OwnClubTeam shape the list uses. */
async function getOwnClubTeamsById(entryId: number, seasonId: number): Promise<OwnClubTeam[]> {
  const all = await getOwnClubTeams(seasonId);
  return all.filter((t) => t.id === entryId);
}

export async function reorderTeamEntries(
  entryIds: number[],
  seasonId?: number,
): Promise<TeamReorderItem[]> {
  const unique = new Set(entryIds);
  if (unique.size !== entryIds.length) throw TeamReorderError.duplicateTeamId();

  const scopeId = seasonId !== undefined ? seasonId : await getActiveSeasonId();
  if (scopeId === null) throw TeamReorderError.invalidTeamSet();

  return await getDb().transaction(async (tx) => {
    const own = await tx
      .select({ id: teamEntries.id })
      .from(teamEntries)
      .innerJoin(teams, eq(teamEntries.teamId, teams.id))
      .where(and(eq(teamEntries.seasonId, scopeId), eq(teams.isOwnClub, true)));
    const ownIds = new Set(own.map((t) => t.id));
    if (ownIds.size !== entryIds.length || entryIds.some((id) => !ownIds.has(id))) {
      throw TeamReorderError.invalidTeamSet();
    }

    // ::integer cast forces the bound parameter type — without it, node-postgres sends
    // the index as text and Postgres can't infer the column type inside CASE.
    const cases = entryIds
      .map((id, idx) => sql`WHEN ${id} THEN ${idx}::integer`)
      .reduce((acc, frag) => sql`${acc} ${frag}`);
    await tx
      .update(teamEntries)
      .set({ displayOrder: sql`CASE ${teamEntries.id} ${cases} END`, updatedAt: new Date() })
      .where(inArray(teamEntries.id, entryIds));

    const updated = await tx
      .select({ id: teamEntries.id, name: teams.name, displayOrder: teamEntries.displayOrder })
      .from(teamEntries)
      .innerJoin(teams, eq(teamEntries.teamId, teams.id))
      .where(inArray(teamEntries.id, entryIds));
    return updated.sort((a, b) => a.displayOrder - b.displayOrder);
  });
}
