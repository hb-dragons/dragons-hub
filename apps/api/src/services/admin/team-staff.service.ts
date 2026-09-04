import { getDb } from "../../config/database";
import { teams, teamEntries, teamStaff, staffPeople } from "@dragons/db/schema";
import { and, eq } from "drizzle-orm";
import type { TeamStaffMember } from "@dragons/shared";
import type { TeamStaffCreateBody, TeamStaffUpdateBody } from "@dragons/contracts";
import { dispatchSiteRebuild } from "../site-rebuild.service";
import { isUniqueViolation } from "../db-errors";
import { insertStaffPerson } from "./staff-person.service";

/**
 * Assignments of staff people to team entries (ADR 0009). This module owns the
 * role and the referee-contact flag; the name, contact data, licence and
 * portrait belong to the person and are edited through `staff-person.service`.
 */

/** Trainer above Co-Trainer; alphabetical inside a role. */
const ROLE_RANK: Record<TeamStaffMember["role"], number> = { trainer: 0, co_trainer: 1 };

/** The assignment joined to its person — what the admin endpoints return. */
const MEMBER_COLUMNS = {
  id: teamStaff.id,
  teamEntryId: teamStaff.teamEntryId,
  personId: teamStaff.personId,
  role: teamStaff.role,
  refereeContact: teamStaff.refereeContact,
  firstName: staffPeople.firstName,
  lastName: staffPeople.lastName,
  phone: staffPeople.phone,
  email: staffPeople.email,
  licence: staffPeople.licence,
  photoFilename: staffPeople.photoFilename,
};

type MemberRow = Omit<TeamStaffMember, "photoUrl"> & { photoFilename: string | null };

/**
 * Replaces the stored object name with the path the portrait is served from —
 * the person's route, since the object belongs to the person and not to this
 * team's assignment.
 */
function toMember({ photoFilename, ...rest }: MemberRow): TeamStaffMember {
  return {
    ...rest,
    photoUrl:
      photoFilename === null
        ? null
        : `/admin/staff-people/${rest.personId}/photo?v=${photoFilename}`,
  };
}

function byRoleThenName(a: TeamStaffMember, b: TeamStaffMember): number {
  return (
    ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
    a.lastName.localeCompare(b.lastName) ||
    a.firstName.localeCompare(b.firstName)
  );
}

/**
 * Whether the id names an own-club team entry. Staff belong to club teams only —
 * an opponent's entry is not something this club maintains people for — and
 * every function below funnels through here so a foreign or unknown id reads as
 * 404 rather than as an empty staff list. Same own-club scoping `updateTeamEntry`
 * applies in `team-admin.service.ts`.
 */
async function isOwnClubEntry(entryId: number): Promise<boolean> {
  const [entry] = await getDb()
    .select({ id: teamEntries.id })
    .from(teamEntries)
    .innerJoin(teams, eq(teamEntries.teamId, teams.id))
    .where(and(eq(teamEntries.id, entryId), eq(teams.isOwnClub, true)));
  return entry !== undefined;
}

/** One assignment read back with its person, or `null` when it is gone. */
async function readMember(assignmentId: number): Promise<TeamStaffMember | null> {
  const [row] = await getDb()
    .select(MEMBER_COLUMNS)
    .from(teamStaff)
    .innerJoin(staffPeople, eq(teamStaff.personId, staffPeople.id))
    .where(eq(teamStaff.id, assignmentId));
  return row ? toMember(row) : null;
}

/** Staff of one team entry, or `null` when the entry is not an own-club entry. */
export async function listTeamStaff(entryId: number): Promise<TeamStaffMember[] | null> {
  if (!(await isOwnClubEntry(entryId))) return null;
  const rows = await getDb()
    .select(MEMBER_COLUMNS)
    .from(teamStaff)
    .innerJoin(staffPeople, eq(teamStaff.personId, staffPeople.id))
    .where(eq(teamStaff.teamEntryId, entryId));
  return rows.map(toMember).sort(byRoleThenName);
}

/**
 * Why an assignment could not be created. Each maps to its own answer: an
 * unknown entry and an unknown person are both 404 but name different things,
 * and a person already on the team is a 409 rather than a second row.
 */
type CreateTeamStaffFailure = "entry-not-found" | "person-not-found" | "duplicate";

export type CreateTeamStaffResult =
  | { ok: true; member: TeamStaffMember }
  | { ok: false; reason: CreateTeamStaffFailure };

/**
 * Attaches a person to a team entry, creating the person first when the caller
 * sent an inline one — the common case of a coach the club does not know yet,
 * kept to a single dialog. A person the club already knows is picked by id, so
 * their phone number and portrait are shared rather than copied.
 */
export async function createTeamStaff(
  entryId: number,
  body: TeamStaffCreateBody,
): Promise<CreateTeamStaffResult> {
  if (!(await isOwnClubEntry(entryId))) return { ok: false, reason: "entry-not-found" };

  if (!("person" in body)) {
    const [person] = await getDb()
      .select({ id: staffPeople.id })
      .from(staffPeople)
      .where(eq(staffPeople.id, body.personId))
      .limit(1);
    if (!person) return { ok: false, reason: "person-not-found" };
  }

  let assignmentId: number;
  try {
    // One transaction, so a rejected assignment takes an inline person with it
    // rather than leaving a nameless half-entry in the pool.
    assignmentId = await getDb().transaction(async (tx) => {
      const personId =
        "person" in body ? (await insertStaffPerson(tx, body.person)).id : body.personId;
      const [row] = await tx
        .insert(teamStaff)
        .values({
          teamEntryId: entryId,
          personId,
          role: body.role,
          refereeContact: body.refereeContact ?? false,
        })
        .returning({ id: teamStaff.id });
      // `returning` on a single-row insert always yields the row; the guard only
      // keeps the id non-optional.
      if (!row) throw new Error("Insert returned no team staff assignment");
      return row.id;
    });
  } catch (error) {
    // The unique constraint on (entry, person) is what keeps a team from
    // showing the same human twice — a repeat pick is that, not a 500.
    if (isUniqueViolation(error)) return { ok: false, reason: "duplicate" };
    throw error;
  }

  const member = await readMember(assignmentId);
  if (!member) return { ok: false, reason: "entry-not-found" };
  await dispatchSiteRebuild("team staff created");
  return { ok: true, member };
}

/** Updates the role and the referee-contact flag. The person is not touched. */
export async function updateTeamStaff(
  entryId: number,
  staffId: number,
  body: TeamStaffUpdateBody,
): Promise<TeamStaffMember | null> {
  if (!(await isOwnClubEntry(entryId))) return null;

  // Only the keys the caller actually sent are written, so an omitted field
  // stays untouched.
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.role !== undefined) set["role"] = body.role;
  if (body.refereeContact !== undefined) set["refereeContact"] = body.refereeContact;

  const [row] = await getDb()
    .update(teamStaff)
    .set(set)
    // The entry predicate is what stops an assignment id from one team being
    // patched through another team's URL.
    .where(and(eq(teamStaff.id, staffId), eq(teamStaff.teamEntryId, entryId)))
    .returning({ id: teamStaff.id });
  if (!row) return null;
  const member = await readMember(row.id);
  if (!member) return null;
  await dispatchSiteRebuild("team staff updated");
  return member;
}

/**
 * Removes the assignment. The person stays in the pool with their contact data
 * — a mid-season team change is not a reason to forget the human.
 */
export async function deleteTeamStaff(entryId: number, staffId: number): Promise<boolean> {
  if (!(await isOwnClubEntry(entryId))) return false;
  const deleted = await getDb()
    .delete(teamStaff)
    .where(and(eq(teamStaff.id, staffId), eq(teamStaff.teamEntryId, entryId)))
    .returning({ id: teamStaff.id });
  if (!deleted[0]) return false;
  await dispatchSiteRebuild("team staff deleted");
  return true;
}
