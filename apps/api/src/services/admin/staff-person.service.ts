import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { staffPeople, teamStaff, teamEntries, teams } from "@dragons/db/schema";
import {
  teamDisplayName,
  type StaffPerson,
  type StaffPersonAssignment,
  type StaffPersonWithAssignments,
} from "@dragons/shared";
import type { StaffPersonCreateBody, StaffPersonUpdateBody } from "@dragons/contracts";
import { getDb } from "../../config/database";
import { withActiveSeason } from "../season-scope";
import { dispatchSiteRebuild } from "../site-rebuild.service";
import {
  storeStaffPortrait,
  readStaffPortrait,
  deleteStaffPortrait,
  staffPortraitContentType,
} from "./team-staff-photo.service";

/**
 * The pool of staff people (ADR 0009). A person exists once however many teams
 * they are attached to, so the contact data, the licence and the portrait are
 * read and written here — the team-scoped endpoints only own the role and the
 * referee-contact flag.
 */

/**
 * The database handle an insert can run against: the pooled client, or the
 * transaction one a caller has already opened.
 */
type StaffPersonExecutor = Pick<ReturnType<typeof getDb>, "insert">;

const PERSON_COLUMNS = {
  id: staffPeople.id,
  firstName: staffPeople.firstName,
  lastName: staffPeople.lastName,
  phone: staffPeople.phone,
  email: staffPeople.email,
  licence: staffPeople.licence,
  photoFilename: staffPeople.photoFilename,
};

/** A selected row — `PERSON_COLUMNS` minus the mapping to `photoUrl`. */
type PersonRow = Omit<StaffPerson, "photoUrl"> & { photoFilename: string | null };

/**
 * Replaces the stored object name with the path the portrait is served from.
 * The object name rides along as `?v=` so a replaced portrait is fetched again
 * rather than read from the cache the image route sets on the old one.
 */
function toPerson({ photoFilename, ...rest }: PersonRow): StaffPerson {
  return {
    ...rest,
    photoUrl:
      photoFilename === null ? null : `/admin/staff-people/${rest.id}/photo?v=${photoFilename}`,
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
  "phone",
  "email",
  "licence",
] as const satisfies readonly (keyof StaffPersonUpdateBody)[];

/** The other direction: every key of the update body must appear in the list above. */
type _EveryPatchableFieldListed = keyof StaffPersonUpdateBody extends
  (typeof PATCHABLE_FIELDS)[number]
  ? true
  : [
      "missing from PATCHABLE_FIELDS",
      Exclude<keyof StaffPersonUpdateBody, (typeof PATCHABLE_FIELDS)[number]>,
    ];
const _patchableFieldsAreExhaustive: _EveryPatchableFieldListed = true;
void _patchableFieldsAreExhaustive;

function byName(a: { lastName: string; firstName: string }, b: typeof a): number {
  return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
}

/**
 * The current season's assignments of the given people, grouped by person.
 * Scoped to the active season because the pool answers "who trains what now" —
 * last season's entries would list teams that are no longer fielded.
 */
async function assignmentsByPerson(
  personIds: number[],
): Promise<Map<number, StaffPersonAssignment[]>> {
  const grouped = new Map<number, StaffPersonAssignment[]>(personIds.map((id) => [id, []]));
  if (personIds.length === 0) return grouped;

  const rows = await withActiveSeason(
    (seasonId) =>
      getDb()
        .select({
          id: teamStaff.id,
          personId: teamStaff.personId,
          teamEntryId: teamStaff.teamEntryId,
          role: teamStaff.role,
          refereeContact: teamStaff.refereeContact,
          name: teams.name,
          nameShort: teams.nameShort,
          customName: teamEntries.customName,
        })
        .from(teamStaff)
        .innerJoin(teamEntries, eq(teamStaff.teamEntryId, teamEntries.id))
        .innerJoin(teams, eq(teamEntries.teamId, teams.id))
        .where(
          and(inArray(teamStaff.personId, personIds), eq(teamEntries.seasonId, seasonId)),
        ),
    [] as {
      id: number;
      personId: number;
      teamEntryId: number;
      role: StaffPersonAssignment["role"];
      refereeContact: boolean;
      name: string;
      nameShort: string | null;
      customName: string | null;
    }[],
  );

  for (const { personId, name, nameShort, customName, ...rest } of rows) {
    grouped.get(personId)?.push({
      ...rest,
      teamName: teamDisplayName({ name, nameShort, customName }),
    });
  }
  for (const assignments of grouped.values()) {
    assignments.sort((a, b) => a.teamName.localeCompare(b.teamName));
  }
  return grouped;
}

/**
 * The pool, alphabetical by name, each person with the teams they hold this
 * season. `search` matches a fragment of either name and of the full name in
 * both orders, so "lovelace", "ada lov" and "lovelace, ada" all find the same
 * person — an admin should not have to know which half the club filed them
 * under, nor which way round the editor shows it.
 */
export async function listStaffPeople(search?: string): Promise<StaffPersonWithAssignments[]> {
  const fragment = search?.trim();
  const pattern = `%${fragment}%`;
  const rows = await getDb()
    .select(PERSON_COLUMNS)
    .from(staffPeople)
    .where(
      fragment
        ? or(
            ilike(staffPeople.firstName, pattern),
            ilike(staffPeople.lastName, pattern),
            ilike(sql`${staffPeople.firstName} || ' ' || ${staffPeople.lastName}`, pattern),
            ilike(sql`${staffPeople.lastName} || ', ' || ${staffPeople.firstName}`, pattern),
          )
        : undefined,
    )
    .orderBy(asc(staffPeople.lastName), asc(staffPeople.firstName));

  const assignments = await assignmentsByPerson(rows.map((r) => r.id));
  return rows
    .map((row) => ({ ...toPerson(row), assignments: assignments.get(row.id) ?? [] }))
    .sort(byName);
}

/**
 * The insert itself, against any executor. Taking the handle lets a caller run
 * it inside its own transaction — `createTeamStaff` creates the inline person
 * and the assignment together, so neither survives the other failing.
 */
export async function insertStaffPerson(
  db: StaffPersonExecutor,
  body: StaffPersonCreateBody,
): Promise<StaffPerson> {
  const [row] = await db
    .insert(staffPeople)
    .values({
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone ?? null,
      email: body.email ?? null,
      licence: body.licence ?? null,
    })
    .returning(PERSON_COLUMNS);
  // `returning` on a single-row insert always yields the row; the guard only
  // keeps the return type non-optional.
  if (!row) throw new Error("Insert returned no staff person");
  return toPerson(row);
}

export function createStaffPerson(body: StaffPersonCreateBody): Promise<StaffPerson> {
  return insertStaffPerson(getDb(), body);
}

export async function updateStaffPerson(
  id: number,
  body: StaffPersonUpdateBody,
): Promise<StaffPerson | null> {
  // Only the keys the caller actually sent are written, so an omitted field
  // stays untouched while an explicit `null` on a contact field still clears it
  // — `{...body}` would not tell those two apart.
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of PATCHABLE_FIELDS) {
    if (body[field] !== undefined) set[field] = body[field];
  }

  const [row] = await getDb()
    .update(staffPeople)
    .set(set)
    .where(eq(staffPeople.id, id))
    .returning(PERSON_COLUMNS);
  if (!row) return null;
  // The name and the licence show on the Website's team pages.
  await dispatchSiteRebuild("staff person updated");
  return toPerson(row);
}

/**
 * Deleting a person is only allowed once nothing points at them: a person
 * attached to a team is a team's contact, and dropping them would silently
 * empty that team's staff block. The admin removes the assignments first.
 */
export async function deleteStaffPerson(
  id: number,
): Promise<"deleted" | "not-found" | "assigned"> {
  const [assignment] = await getDb()
    .select({ id: teamStaff.id })
    .from(teamStaff)
    .where(eq(teamStaff.personId, id))
    .limit(1);
  if (assignment) return "assigned";

  const [deleted] = await getDb()
    .delete(staffPeople)
    .where(eq(staffPeople.id, id))
    .returning({ id: staffPeople.id, photoFilename: staffPeople.photoFilename });
  if (!deleted) return "not-found";
  if (deleted.photoFilename) await deleteStaffPortrait(deleted.photoFilename);
  return "deleted";
}

/**
 * Stores a new portrait for a person and points the row at it, dropping the
 * object it replaced. Returns `null` when the person does not exist; throws
 * `PortraitRejected` when the bytes are not a storable image.
 */
export async function setStaffPersonPhoto(
  id: number,
  buffer: Buffer,
  contentType: string,
): Promise<StaffPerson | null> {
  const previous = await findPortrait(id);
  if (previous === null) return null;

  // Store first: an upload that fails leaves the row pointing at the portrait
  // it already had rather than at nothing.
  const filename = await storeStaffPortrait(buffer, contentType);
  const [row] = await getDb()
    .update(staffPeople)
    .set({ photoFilename: filename, updatedAt: new Date() })
    .where(eq(staffPeople.id, id))
    .returning(PERSON_COLUMNS);
  if (!row) {
    // The row went away between the lookup and the write, so nothing will ever
    // point at what we just uploaded.
    await deleteStaffPortrait(filename);
    return null;
  }

  // One object per person now, so the portrait it replaced has no other
  // referent — unlike the old per-team rows, which shared objects across
  // seasons and needed a reference check before deleting.
  if (previous.photoFilename) await deleteStaffPortrait(previous.photoFilename);
  await dispatchSiteRebuild("staff portrait changed");
  return toPerson(row);
}

/** The stored portrait bytes plus the type to serve them as, or `null`. */
export async function getStaffPersonPhoto(
  id: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const person = await findPortrait(id);
  if (!person?.photoFilename) return null;
  return {
    buffer: await readStaffPortrait(person.photoFilename),
    contentType: staffPortraitContentType(person.photoFilename),
  };
}

/** The portrait pointer of one person, or `null` when there is no such person. */
async function findPortrait(id: number): Promise<{ photoFilename: string | null } | null> {
  const [row] = await getDb()
    .select({ photoFilename: staffPeople.photoFilename })
    .from(staffPeople)
    .where(eq(staffPeople.id, id));
  return row ?? null;
}
