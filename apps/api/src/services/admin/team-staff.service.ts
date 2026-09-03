import { getDb } from "../../config/database";
import { teams, teamEntries, teamStaff } from "@dragons/db/schema";
import { and, eq } from "drizzle-orm";
import type { TeamStaffMember } from "@dragons/shared";
import type { TeamStaffCreateBody, TeamStaffUpdateBody } from "@dragons/contracts";
import {
  storeStaffPortrait,
  readStaffPortrait,
  deleteStaffPortrait,
  staffPortraitContentType,
} from "./team-staff-photo.service";

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

/** A selected row — `STAFF_COLUMNS` minus the mapping to `photoUrl`. */
type StaffRow = Omit<TeamStaffMember, "photoUrl"> & { photoFilename: string | null };

/**
 * Replaces the stored object name with the path the portrait is served from.
 * The object name rides along as `?v=` so a replaced portrait is fetched again
 * rather than read from the cache the image route sets on the old one.
 */
function toMember({ photoFilename, ...rest }: StaffRow): TeamStaffMember {
  return {
    ...rest,
    photoUrl:
      photoFilename === null
        ? null
        : `/admin/teams/${rest.teamEntryId}/staff/${rest.id}/photo?v=${photoFilename}`,
  };
}

/**
 * The fields a PATCH may write. Typed as keys of the update body, so a field
 * added to the contract and forgotten here — or listed here after leaving the
 * contract — fails to compile rather than silently going unwritten.
 */
const PATCHABLE_FIELDS = [
  "firstName",
  "lastName",
  "role",
  "phone",
  "email",
  "licence",
  "refereeContact",
] as const satisfies readonly (keyof TeamStaffUpdateBody)[];

/** The other direction: every key of the update body must appear in the list above. */
type _EveryPatchableFieldListed = keyof TeamStaffUpdateBody extends
  (typeof PATCHABLE_FIELDS)[number]
  ? true
  : ["missing from PATCHABLE_FIELDS", Exclude<keyof TeamStaffUpdateBody, (typeof PATCHABLE_FIELDS)[number]>];
const _patchableFieldsAreExhaustive: _EveryPatchableFieldListed = true;
void _patchableFieldsAreExhaustive;

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

/**
 * Drops a portrait object once nothing points at it any more. Season rollover
 * copies `photoFilename` onto the new entry's row rather than duplicating the
 * object (`copyStaffForward` in `team-entry-seeding.service.ts`), so the same
 * object is routinely shared by one coach's rows across seasons — deleting it
 * on the strength of a single row would 404 the portrait on all the others.
 * Call this only after the row that pointed at the object has been repointed
 * or removed, so the check sees the state the caller is leaving behind.
 */
async function dropPortraitIfUnreferenced(filename: string | null): Promise<void> {
  if (!filename) return;
  const [stillReferenced] = await getDb()
    .select({ id: teamStaff.id })
    .from(teamStaff)
    .where(eq(teamStaff.photoFilename, filename))
    .limit(1);
  if (!stillReferenced) await deleteStaffPortrait(filename);
}

/** Staff of one team entry, or `null` when the entry is not an own-club entry. */
export async function listTeamStaff(entryId: number): Promise<TeamStaffMember[] | null> {
  if (!(await isOwnClubEntry(entryId))) return null;
  const rows = await getDb()
    .select(STAFF_COLUMNS)
    .from(teamStaff)
    .where(eq(teamStaff.teamEntryId, entryId));
  return rows.map(toMember).sort(byRoleThenName);
}

export async function createTeamStaff(
  entryId: number,
  body: TeamStaffCreateBody,
): Promise<TeamStaffMember | null> {
  if (!(await isOwnClubEntry(entryId))) return null;
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
  return row ? toMember(row) : null;
}

export async function updateTeamStaff(
  entryId: number,
  staffId: number,
  body: TeamStaffUpdateBody,
): Promise<TeamStaffMember | null> {
  if (!(await isOwnClubEntry(entryId))) return null;

  // Only the keys the caller actually sent are written, so an omitted field
  // stays untouched while an explicit `null` on a contact field still clears it
  // — `{...body}` would not tell those two apart.
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of PATCHABLE_FIELDS) {
    if (body[field] !== undefined) set[field] = body[field];
  }

  const [row] = await getDb()
    .update(teamStaff)
    .set(set)
    // The entry predicate is what stops a staff id from one team being patched
    // through another team's URL.
    .where(and(eq(teamStaff.id, staffId), eq(teamStaff.teamEntryId, entryId)))
    .returning(STAFF_COLUMNS);
  return row ? toMember(row) : null;
}

export async function deleteTeamStaff(entryId: number, staffId: number): Promise<boolean> {
  if (!(await isOwnClubEntry(entryId))) return false;
  const deleted = await getDb()
    .delete(teamStaff)
    .where(and(eq(teamStaff.id, staffId), eq(teamStaff.teamEntryId, entryId)))
    .returning({ id: teamStaff.id, photoFilename: teamStaff.photoFilename });
  const removed = deleted[0];
  if (!removed) return false;
  await dropPortraitIfUnreferenced(removed.photoFilename);
  return true;
}

/**
 * Stores a new portrait for a staff member and points the row at it, dropping
 * the object it replaced. Returns `null` when the entry is not an own-club
 * entry or the staff id is not one of its rows; throws `PortraitRejected` when
 * the bytes are not a storable image.
 */
export async function setTeamStaffPhoto(
  entryId: number,
  staffId: number,
  buffer: Buffer,
  contentType: string,
): Promise<TeamStaffMember | null> {
  const previous = await findStaffPhoto(entryId, staffId);
  if (previous === null) return null;

  // Store first: an upload that fails leaves the row pointing at the portrait
  // it already had rather than at nothing.
  const filename = await storeStaffPortrait(buffer, contentType);
  const [row] = await getDb()
    .update(teamStaff)
    .set({ photoFilename: filename, updatedAt: new Date() })
    .where(and(eq(teamStaff.id, staffId), eq(teamStaff.teamEntryId, entryId)))
    .returning(STAFF_COLUMNS);
  if (!row) {
    // The row went away between the lookup and the write, so nothing will ever
    // point at what we just uploaded.
    await deleteStaffPortrait(filename);
    return null;
  }

  await dropPortraitIfUnreferenced(previous.photoFilename);
  return toMember(row);
}

/** The stored portrait bytes plus the type to serve them as, or `null`. */
export async function getTeamStaffPhoto(
  entryId: number,
  staffId: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const staff = await findStaffPhoto(entryId, staffId);
  if (!staff?.photoFilename) return null;
  return {
    buffer: await readStaffPortrait(staff.photoFilename),
    contentType: staffPortraitContentType(staff.photoFilename),
  };
}

/**
 * The portrait pointer of one staff member, or `null` when the entry is not an
 * own-club entry or the staff id does not belong to it. Both photo paths funnel
 * through here so neither can skip the own-club scoping.
 */
async function findStaffPhoto(
  entryId: number,
  staffId: number,
): Promise<{ photoFilename: string | null } | null> {
  if (!(await isOwnClubEntry(entryId))) return null;
  const [row] = await getDb()
    .select({ photoFilename: teamStaff.photoFilename })
    .from(teamStaff)
    .where(and(eq(teamStaff.id, staffId), eq(teamStaff.teamEntryId, entryId)));
  return row ?? null;
}
