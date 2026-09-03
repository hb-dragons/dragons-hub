/**
 * The Hub side of the import. The staff rows land in the Hub's own database
 * (`team_staff`), not the CMS one — this script is the only thing in
 * `apps/cms` that talks to it, which is why `DATABASE_URL` shows up in the
 * CMS env contract at all.
 *
 * Writes go straight through Drizzle rather than the admin endpoints: those
 * are session-authenticated for a human admin, and a one-off run has no
 * session to carry.
 */
import { createDb, seasons, teamEntries, teamStaff, teams } from "@dragons/db";
import type { Database } from "@dragons/db";
import { eq, inArray } from "drizzle-orm";

import { staffKey, type PlannedStaffRow } from "./mappers";

function env(name: "DATABASE_URL"): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
}

export function openHub(): ReturnType<typeof createDb> {
  return createDb(env("DATABASE_URL"));
}

/** `teams.apiTeamPermanentId` → the team entry id of the active season. */
export async function activeSeasonEntries(db: Database): Promise<Map<number, number>> {
  const rows = await db
    .select({ permanentId: teams.apiTeamPermanentId, entryId: teamEntries.id })
    .from(teamEntries)
    .innerJoin(teams, eq(teams.id, teamEntries.teamId))
    .innerJoin(seasons, eq(seasons.id, teamEntries.seasonId))
    .where(eq(seasons.status, "active"));
  return new Map(rows.map((row) => [row.permanentId, row.entryId]));
}

/** The idempotency keys already held for the entries the import plans to touch. */
export async function existingStaffKeys(db: Database, entryIds: number[]): Promise<Set<string>> {
  if (entryIds.length === 0) return new Set();
  const rows = await db
    .select({
      teamEntryId: teamStaff.teamEntryId,
      firstName: teamStaff.firstName,
      lastName: teamStaff.lastName,
    })
    .from(teamStaff)
    .where(inArray(teamStaff.teamEntryId, entryIds));
  return new Set(rows.map(staffKey));
}

export async function insertStaff(db: Database, rows: PlannedStaffRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await db.insert(teamStaff).values(rows).returning({ id: teamStaff.id });
  return inserted.length;
}
