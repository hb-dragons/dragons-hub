import { eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "../../config/database";
import { user } from "@dragons/db/schema";
import { satisfiesRole } from "@dragons/shared";

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
    // user.role is better-auth's comma-separated role string (e.g.
    // "admin,refereeAdmin"), so it can't be matched with equality — filter in
    // application code via the shared RBAC helper. satisfiesRole(user,
    // "admin") also admits superadmin, which is a documented superset of
    // admin and must receive every admin-audience push.
    const rows = await getDb()
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(isNotNull(user.role));
    return rows.filter((r) => satisfiesRole(r, "admin")).map((r) => r.id);
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

/** A user whose address the email adapter may send to. */
interface EmailRecipient {
  userId: string;
  name: string;
  address: string;
}

/** A user the email adapter must not send to, and why. */
interface SkippedEmailRecipient {
  userId: string;
  reason: "unverified" | "no_account";
}

export interface EmailRecipientResolution {
  deliverable: EmailRecipient[];
  skipped: SkippedEmailRecipient[];
}

/**
 * Translate user ids into the addresses the `email` channel delivers to.
 *
 * `user.email` is the address — better-auth owns it, it is `notNull().unique()`,
 * and there is no second place a member address is recorded.
 *
 * **An unverified address is not a valid notification recipient.** `email` is
 * the only channel whose target is typed in by hand rather than proved by
 * possession (a push token comes from a device that installed the app, a group
 * chat id from the group itself), so an address nobody has confirmed may be a
 * typo, or worse, a real stranger's mailbox that a member mistyped into. Sending
 * to it leaks club business to whoever owns it and earns the relay hard bounces,
 * which is how a sending domain loses its reputation. Unverified users are
 * therefore skipped and reported with a reason — never dropped silently, since
 * the fix (an admin confirming the address) is only possible if someone can see
 * that delivery is being withheld.
 *
 * A user id with no row at all is reported as `no_account` rather than
 * conflated with an unverified one: it means a recipient key outlived the
 * account it addressed, which is an integrity problem, not a preference.
 */
export async function resolveEmailRecipients(
  userIds: string[],
): Promise<EmailRecipientResolution> {
  if (userIds.length === 0) return { deliverable: [], skipped: [] };

  const rows = await getDb()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
    })
    .from(user)
    .where(inArray(user.id, userIds));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const deliverable: EmailRecipient[] = [];
  const skipped: SkippedEmailRecipient[] = [];

  for (const userId of userIds) {
    const row = byId.get(userId);
    if (!row) {
      skipped.push({ userId, reason: "no_account" });
      continue;
    }
    if (!row.emailVerified) {
      skipped.push({ userId, reason: "unverified" });
      continue;
    }
    deliverable.push({ userId: row.id, name: row.name, address: row.email });
  }

  return { deliverable, skipped };
}
