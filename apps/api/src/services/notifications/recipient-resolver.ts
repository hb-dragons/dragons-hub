import { eq, isNotNull } from "drizzle-orm";
import { getDb } from "../../config/database";
import { user } from "@dragons/db/schema";

/**
 * Translate a pipeline recipientId (e.g., "referee:42", "audience:admin",
 * "user:u_abc") into one or more user IDs usable for push_devices lookup.
 */
export async function resolveRecipientUserIds(
  recipientId: string,
): Promise<string[]> {
  if (recipientId.startsWith("referee:")) {
    const refereeId = Number(recipientId.slice("referee:".length));
    if (!Number.isFinite(refereeId)) return [];
    const rows = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.refereeId, refereeId));
    return rows.map((r) => r.id);
  }

  if (recipientId === "audience:admin") {
    const rows = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, "admin"));
    return rows.map((r) => r.id);
  }

  if (recipientId === "audience:referee") {
    // Every user linked to a referee identity. Referees carry no role value
    // post-RBAC-cleanup, so this is keyed off the referee link, not a role.
    const rows = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(isNotNull(user.refereeId));
    return rows.map((r) => r.id);
  }

  if (recipientId.startsWith("user:")) {
    return [recipientId.slice("user:".length)];
  }

  return [];
}
