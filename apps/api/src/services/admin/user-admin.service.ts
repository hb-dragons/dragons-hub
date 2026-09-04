import { getDb } from "../../config/database";
import { user as userTable, referees, staffPeople } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { parseRoles } from "@dragons/shared";
import { UserAdminError } from "./user-admin.errors";
import { isUniqueViolation } from "../db-errors";

/**
 * Links or unlinks a referee record from a user account.
 *
 * When `refereeId` is not null, the referee's existence is checked first,
 * unconditionally — before the user row is even touched. This preserves the
 * route's original order: passing both an unknown user id and an unknown
 * referee id throws `REFEREE_NOT_FOUND`, not `USER_NOT_FOUND`.
 */
export async function setUserRefereeLink(
  userId: string,
  refereeId: number | null,
): Promise<{ id: string; refereeId: number | null }> {
  if (refereeId !== null) {
    const [referee] = await getDb()
      .select({ id: referees.id })
      .from(referees)
      .where(eq(referees.id, refereeId))
      .limit(1);

    if (!referee) {
      throw new UserAdminError("Referee not found", "REFEREE_NOT_FOUND");
    }
  }

  const [updated] = await getDb()
    .update(userTable)
    .set({ refereeId, updatedAt: new Date() })
    .where(eq(userTable.id, userId))
    .returning({ id: userTable.id, refereeId: userTable.refereeId });

  if (!updated) {
    throw new UserAdminError("User not found", "USER_NOT_FOUND");
  }

  return updated;
}

/**
 * Links or unlinks a staff person from a user account, optionally granting the
 * read-only `coach` role in the same step.
 *
 * The link is to the person, not to one team's assignment (ADR 0009), so it
 * survives the coach changing teams and a self-edit reaches every team at once.
 *
 * Mirrors `setUserRefereeLink`, with two differences the staff link needs:
 *
 * - The unique constraint on `user.person_id` is checked up front, so a second
 *   account claiming the same person answers 409 instead of surfacing a
 *   Postgres constraint violation as a 500. Re-linking the account that already
 *   holds it is not a conflict.
 * - `grantCoachRole` only ever *adds* the role, and only when linking. Roles are
 *   a comma-joined string on `user.role`; unlinking touches none of them, so a
 *   coach who stops being staff keeps whatever access an admin gave them until
 *   an admin takes it away. The write goes straight to the column rather than
 *   through better-auth's admin `setRole`, so a session whose cookie cache
 *   already holds the old role keeps it for up to the 5 minutes
 *   `config/auth.ts` sets — the grant is for someone else's account in
 *   practice, and it heals on the next session refresh.
 */
export async function setUserStaffLink(
  userId: string,
  personId: number | null,
  grantCoachRole: boolean,
): Promise<{ id: string; personId: number | null; role: string | null }> {
  if (personId !== null) {
    const [person] = await getDb()
      .select({ id: staffPeople.id })
      .from(staffPeople)
      .where(eq(staffPeople.id, personId))
      .limit(1);

    if (!person) {
      throw new UserAdminError("Staff person not found", "STAFF_NOT_FOUND");
    }

    const [holder] = await getDb()
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.personId, personId))
      .limit(1);

    if (holder && holder.id !== userId) {
      throw new UserAdminError(
        "Staff person is already linked to another account",
        "STAFF_ALREADY_LINKED",
      );
    }
  }

  const [existing] = await getDb()
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  if (!existing) {
    throw new UserAdminError("User not found", "USER_NOT_FOUND");
  }

  const role =
    personId !== null && grantCoachRole ? withCoachRole(existing.role) : existing.role;

  const [updated] = await runStaffUpdate(userId, personId, role);

  // The row was read a statement earlier, so this only fires if it vanished in
  // between. Keeping the guard means the return type stays non-optional.
  if (!updated) {
    throw new UserAdminError("User not found", "USER_NOT_FOUND");
  }

  return updated;
}

/**
 * Runs the link update, translating the unique violation on `user.person_id`
 * into the same 409 the up-front holder check produces. That check is a read
 * followed by a write, so two admins linking the same person at once can both
 * pass it; without this the loser would get a 500 for what is, to them,
 * exactly the conflict the first caller was told about.
 */
async function runStaffUpdate(userId: string, personId: number | null, role: string | null) {
  try {
    return await getDb()
      .update(userTable)
      .set({ personId, role, updatedAt: new Date() })
      .where(eq(userTable.id, userId))
      .returning({
        id: userTable.id,
        personId: userTable.personId,
        role: userTable.role,
      });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new UserAdminError(
        "Staff person is already linked to another account",
        "STAFF_ALREADY_LINKED",
      );
    }
    throw error;
  }
}

/** Appends `coach` to a comma-joined role string, leaving the rest in order. */
function withCoachRole(role: string | null): string {
  const roles = parseRoles(role);
  return roles.includes("coach") ? roles.join(",") : [...roles, "coach"].join(",");
}
