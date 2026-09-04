import type { MyStaffProfile } from "@dragons/shared";
import type { MeStaffUpdateBody } from "@dragons/contracts";
import {
  getStaffPersonWithAssignments,
  updateStaffPerson,
} from "../admin/staff-person.service";

/**
 * A coach's own staff record (#315). There is no separate storage behind this:
 * the account is linked to a `staff_people` row (ADR 0009), so the coach edits
 * the same person the admin editor does and every team they train shows the new
 * number at once. What this module owns is the self-service view of that
 * person: the scope (the id comes from the session, never from a path) and the
 * payload, which drops the portrait URL — that route is admin-gated, so a coach
 * could not fetch the image behind it.
 */

/** The person as a coach sees themselves, portrait URL removed. */
function toMyStaff({
  photoUrl: _photoUrl,
  ...profile
}: NonNullable<Awaited<ReturnType<typeof getStaffPersonWithAssignments>>>): MyStaffProfile {
  return profile;
}

/** The linked person, or `null` when the account has no link (or lost it). */
export async function getMyStaff(personId: number): Promise<MyStaffProfile | null> {
  const profile = await getStaffPersonWithAssignments(personId);
  return profile && toMyStaff(profile);
}

/**
 * Writes the coach's own contact data and answers with the record as it now
 * stands, teams included, so the app can render the response without a refetch.
 */
export async function updateMyStaff(
  personId: number,
  body: MeStaffUpdateBody,
): Promise<MyStaffProfile | null> {
  const updated = await updateStaffPerson(personId, body);
  if (!updated) return null;
  return getMyStaff(personId);
}
