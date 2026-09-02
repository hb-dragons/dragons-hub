import { getDb } from "../../config/database";
import { teams, teamEntries, teamStaff } from "@dragons/db/schema";
import { and, eq } from "drizzle-orm";
import type { TeamStaffMember } from "@dragons/shared";
import type { TeamStaffCreateBody, TeamStaffUpdateBody } from "@dragons/contracts";

export type { TeamStaffMember } from "@dragons/shared";

/** Trainer above Co-Trainer; alphabetical inside a role. */
const ROLE_RANK: Record<TeamStaffMember["role"], number> = { trainer: 0, co_trainer: 1 };

const STAFF_COLUMNS = {
  id: teamStaff.id,
  teamEntryId: teamStaff.teamEntryId,
  firstName: teamStaff.firstName,
  lastName: teamStaff.lastName,
  role: teamStaff.role,
  phone: teamStaff.phone,
  email: teamStaff.email,
  licence: teamStaff.licence,
  photoFilename: teamStaff.photoFilename,
  refereeContact: teamStaff.refereeContact,
};

function byRoleThenName(a: TeamStaffMember, b: TeamStaffMember): number {
  return (
    ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
    a.lastName.localeCompare(b.lastName) ||
    a.firstName.localeCompare(b.firstName)
  );
}

/**
 * The entry id, if it names an own-club team entry. Staff belong to club teams
 * only — an opponent's entry is not something this club maintains people for,
 * and every route below funnels through here so a foreign id reads as 404
 * rather than as an empty staff list.
 */
async function ownClubEntryId(entryId: number): Promise<number | null> {
  const [entry] = await getDb()
    .select({ id: teamEntries.id })
    .from(teamEntries)
    .innerJoin(teams, eq(teamEntries.teamId, teams.id))
    .where(and(eq(teamEntries.id, entryId), eq(teams.isOwnClub, true)));
  return entry?.id ?? null;
}

/** Staff of one team entry, or `null` when the entry is not an own-club entry. */
export async function listTeamStaff(entryId: number): Promise<TeamStaffMember[] | null> {
  if ((await ownClubEntryId(entryId)) === null) return null;
  const rows = await getDb()
    .select(STAFF_COLUMNS)
    .from(teamStaff)
    .where(eq(teamStaff.teamEntryId, entryId));
  return rows.sort(byRoleThenName);
}

export async function createTeamStaff(
  entryId: number,
  body: TeamStaffCreateBody,
): Promise<TeamStaffMember | null> {
  if ((await ownClubEntryId(entryId)) === null) return null;
  const [row] = await getDb()
    .insert(teamStaff)
    .values({
      teamEntryId: entryId,
      firstName: body.firstName,
      lastName: body.lastName,
      role: body.role,
      phone: body.phone ?? null,
      email: body.email ?? null,
      licence: body.licence ?? null,
      refereeContact: body.refereeContact ?? false,
    })
    .returning(STAFF_COLUMNS);
  return row ?? null;
}

export async function updateTeamStaff(
  entryId: number,
  staffId: number,
  body: TeamStaffUpdateBody,
): Promise<TeamStaffMember | null> {
  if ((await ownClubEntryId(entryId)) === null) return null;

  // The set is built key by key rather than spread, so a key the caller omitted
  // stays untouched while an explicit `null` on a contact field still clears it.
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.firstName !== undefined) set.firstName = body.firstName;
  if (body.lastName !== undefined) set.lastName = body.lastName;
  if (body.role !== undefined) set.role = body.role;
  if (body.phone !== undefined) set.phone = body.phone;
  if (body.email !== undefined) set.email = body.email;
  if (body.licence !== undefined) set.licence = body.licence;
  if (body.refereeContact !== undefined) set.refereeContact = body.refereeContact;

  const [row] = await getDb()
    .update(teamStaff)
    .set(set)
    // The entry predicate is what stops a staff id from one team being patched
    // through another team's URL.
    .where(and(eq(teamStaff.id, staffId), eq(teamStaff.teamEntryId, entryId)))
    .returning(STAFF_COLUMNS);
  return row ?? null;
}

export async function deleteTeamStaff(entryId: number, staffId: number): Promise<boolean> {
  if ((await ownClubEntryId(entryId)) === null) return false;
  const deleted = await getDb()
    .delete(teamStaff)
    .where(and(eq(teamStaff.id, staffId), eq(teamStaff.teamEntryId, entryId)))
    .returning({ id: teamStaff.id });
  return deleted.length > 0;
}
