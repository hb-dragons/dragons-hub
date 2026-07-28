import { getDb } from "../../config/database";
import { user as userTable, referees } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { UserAdminError } from "./user-admin.errors";

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
