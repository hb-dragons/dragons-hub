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

import { staffKey, type ExistingStaff, type PlannedStaffRow } from "./mappers";

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

/** The staff rows already held for the entries the import plans to touch. */
export async function existingStaff(db: Database, entryIds: number[]): Promise<ExistingStaff[]> {
  if (entryIds.length === 0) return [];
  return db
    .select({
      id: teamStaff.id,
      teamEntryId: teamStaff.teamEntryId,
      firstName: teamStaff.firstName,
      lastName: teamStaff.lastName,
      photoFilename: teamStaff.photoFilename,
    })
    .from(teamStaff)
    .where(inArray(teamStaff.teamEntryId, entryIds));
}

/** The idempotency keys already held for the entries the import plans to touch. */
export async function existingStaffKeys(db: Database, entryIds: number[]): Promise<Set<string>> {
  return new Set((await existingStaff(db, entryIds)).map(staffKey));
}

/**
 * Point a staff row at the portrait object the `--portraits` pass stored.
 * Throws when the row is gone: the object is already in the bucket by then,
 * and a silent no-op would leave it orphaned without a word in the run log.
 */
export async function setStaffPortrait(db: Database, staffId: number, filename: string): Promise<void> {
  const updated = await db
    .update(teamStaff)
    .set({ photoFilename: filename, updatedAt: new Date() })
    .where(eq(teamStaff.id, staffId))
    .returning({ id: teamStaff.id });
  if (updated.length === 0) {
    throw new Error(`import-staff: staff ${staffId} vanished before its portrait ${filename} was recorded`);
  }
}

export async function insertStaff(db: Database, rows: PlannedStaffRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await db.insert(teamStaff).values(rows).returning({ id: teamStaff.id });
  return inserted.length;
}
