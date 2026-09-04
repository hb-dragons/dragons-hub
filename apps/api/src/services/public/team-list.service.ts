import { asc, eq, and, inArray } from "drizzle-orm";
import { teams, teamEntries, teamStaff, staffPeople, type Team } from "@dragons/db/schema";
import type { PublicTeamStaff } from "@dragons/shared";
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
  /**
   * Present on own-club rows only — an opponent has no staff in the Hub, and
   * an empty array there would read as "no coaches known" rather than "not a
   * thing this club maintains". Optional rather than nullable so a consumer
   * that only renders own-club teams never has to narrow a null.
   */
  staff?: PublicTeamStaff[];
};

/** Trainer above Co-Trainer, alphabetical inside a role — the admin list order. */
const ROLE_RANK: Record<PublicTeamStaff["role"], number> = { trainer: 0, co_trainer: 1 };

/**
 * Staff of the given entries, grouped by entry id. Selects the public columns
 * by name: phone and email are not merely dropped downstream, they are never
 * read, so no later spread can leak them onto a public page. The name, licence
 * and portrait come from the person (ADR 0009), so a coach on two teams shows
 * the same photo on both pages.
 */
async function staffByEntry(entryIds: number[]): Promise<Map<number, PublicTeamStaff[]>> {
  const grouped = new Map<number, PublicTeamStaff[]>(entryIds.map((id) => [id, []]));
  if (entryIds.length === 0) return grouped;

  const rows = await getDb()
    .select({
      id: teamStaff.id,
      teamEntryId: teamStaff.teamEntryId,
      personId: teamStaff.personId,
      firstName: staffPeople.firstName,
      lastName: staffPeople.lastName,
      role: teamStaff.role,
      licence: staffPeople.licence,
      photoFilename: staffPeople.photoFilename,
    })
    .from(teamStaff)
    .innerJoin(staffPeople, eq(teamStaff.personId, staffPeople.id))
    .where(inArray(teamStaff.teamEntryId, entryIds));

  for (const { teamEntryId, photoFilename, ...member } of rows) {
    grouped.get(teamEntryId)?.push({
      ...member,
      // The public portrait route, stamped with the object name so a replaced
      // portrait is fetched again rather than read from the cache the previous
      // one was served with.
      photoUrl:
        photoFilename === null ? null : `/public/staff/${member.id}/photo?v=${photoFilename}`,
    });
  }

  for (const members of grouped.values()) {
    members.sort(
      (a, b) =>
        ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName),
    );
  }
  return grouped;
}

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
        entryId: teamEntries.id,
        customName: teamEntries.customName,
        badgeColor: teamEntries.badgeColor,
        estimatedGameDuration: teamEntries.estimatedGameDuration,
        displayOrder: teamEntries.displayOrder,
      })
      .from(teamEntries)
      .innerJoin(teams, eq(teamEntries.teamId, teams.id))
      .where(and(eq(teamEntries.seasonId, seasonId), eq(teams.isOwnClub, true)))
      .orderBy(asc(teamEntries.displayOrder), asc(teams.name));
    const staff = await staffByEntry(rows.map((r) => r.entryId));
    return rows.map((r) => ({
      ...r.team,
      customName: r.customName,
      badgeColor: r.badgeColor,
      estimatedGameDuration: r.estimatedGameDuration,
      displayOrder: r.displayOrder,
      staff: staff.get(r.entryId) ?? [],
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
