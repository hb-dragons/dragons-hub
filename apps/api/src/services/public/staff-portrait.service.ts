import { and, eq } from "drizzle-orm";
import { teams, teamEntries, teamStaff, staffPeople } from "@dragons/db/schema";
import { getDb } from "../../config/database";
import {
  readStaffPortrait,
  staffPortraitContentType,
} from "../admin/team-staff-photo.service";

/**
 * The public read of a staff portrait. The Website renders coach photos in the
 * browser, so the bytes the admin route serves behind `team:view` need a second,
 * unauthenticated door — the same object, addressed by staff id alone since a
 * static page has no team entry id to hand.
 *
 * Only own-club staff are servable. Assignments can only be created on own-club
 * entries today, so the join is belt and braces: it keeps the route from turning
 * into an open portrait proxy if that ever changes. It also means the address
 * stays the assignment id while the object belongs to the person (ADR 0009), so
 * the Website's existing URLs keep working.
 */
export async function getPublicStaffPortrait(
  staffId: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const [row] = await getDb()
    .select({ photoFilename: staffPeople.photoFilename })
    .from(teamStaff)
    .innerJoin(staffPeople, eq(teamStaff.personId, staffPeople.id))
    .innerJoin(teamEntries, eq(teamStaff.teamEntryId, teamEntries.id))
    .innerJoin(teams, eq(teamEntries.teamId, teams.id))
    .where(and(eq(teamStaff.id, staffId), eq(teams.isOwnClub, true)));

  if (!row?.photoFilename) return null;
  return {
    buffer: await readStaffPortrait(row.photoFilename),
    contentType: staffPortraitContentType(row.photoFilename),
  };
}
