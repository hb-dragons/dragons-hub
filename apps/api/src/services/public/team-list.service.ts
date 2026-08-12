import { asc, eq, and } from "drizzle-orm";
import { teams, teamEntries, type Team } from "@dragons/db/schema";
import { getDb } from "../../config/database";
import { withActiveSeason } from "../season-scope";

/**
 * Public team list element. Same shape as `teams` plus the four fields that
 * moved to `team_entries` — declared here rather than inherited from `Team`
 * so this service keeps compiling once those columns are dropped from
 * `teams` (Task 8).
 */
export type PublicTeam = Team & {
  customName: string | null;
  badgeColor: string | null;
  estimatedGameDuration: number | null;
  displayOrder: number;
};

/**
 * Public team list. Own-club rows are the active season's team entries (a
 * squad without an entry is not fielded this season and is not listed);
 * entry-owned fields override the squad row. Non-own-club rows come straight
 * from `teams` as before. `id` stays the squad id — /public/teams/:id/stats
 * URLs must not change meaning.
 */
export async function listPublicTeams(): Promise<PublicTeam[]> {
  const others = await getDb()
    .select()
    .from(teams)
    .where(eq(teams.isOwnClub, false))
    .orderBy(asc(teams.name));

  const own = await withActiveSeason<PublicTeam[]>(async (seasonId) => {
    const rows = await getDb()
      .select({
        team: teams,
        customName: teamEntries.customName,
        badgeColor: teamEntries.badgeColor,
        estimatedGameDuration: teamEntries.estimatedGameDuration,
        displayOrder: teamEntries.displayOrder,
      })
      .from(teamEntries)
      .innerJoin(teams, eq(teamEntries.teamId, teams.id))
      .where(and(eq(teamEntries.seasonId, seasonId), eq(teams.isOwnClub, true)))
      .orderBy(asc(teamEntries.displayOrder), asc(teams.name));
    return rows.map((r) => ({
      ...r.team,
      customName: r.customName,
      badgeColor: r.badgeColor,
      estimatedGameDuration: r.estimatedGameDuration,
      displayOrder: r.displayOrder,
    }));
  }, []);

  return [
    ...own,
    ...others.map((t) => ({
      ...t,
      customName: null,
      badgeColor: null,
      estimatedGameDuration: null,
      displayOrder: 0,
    })),
  ];
}
