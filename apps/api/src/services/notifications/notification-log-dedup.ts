import { sql } from "drizzle-orm";
import {
  notificationLog,
  notificationLogDedupTarget,
  type NotificationLogInsert,
} from "@dragons/db/schema";
import type { Database } from "@dragons/db";

/** The subset of a Drizzle database (or transaction) this helper needs. */
export type NotificationLogWriter = Pick<Database, "insert" | "execute">;

export interface ClaimedNotificationLogRow {
  id: number;
  recipientId: string | null;
}

/**
 * Insert `notification_log` rows, skipping ones already delivered for the same
 * (event, channel, recipient), and return only the rows actually written.
 *
 * The dedup index is a `COALESCE`-based expression index, which Drizzle's
 * `onConflictDoNothing({ target })` cannot express (its target accepts columns
 * only). Naming the target matters anyway: `onConflictDoNothing()` with no
 * target arbitrates against *every* unique index on the table, so if the dedup
 * index is ever missing the statement still succeeds and writes a duplicate —
 * silently. With the target spelled out, a missing index is a hard 42P10 error.
 *
 * Callers treat an empty result as "already delivered".
 */
export async function insertNotificationLogDeduped(
  db: NotificationLogWriter,
  values: NotificationLogInsert | NotificationLogInsert[],
): Promise<ClaimedNotificationLogRow[]> {
  const rows = Array.isArray(values) ? values : [values];
  if (rows.length === 0) return [];

  // `.getSQL()` (rather than interpolating the builder itself) keeps the INSERT
  // un-parenthesised so the ON CONFLICT clause below attaches to it.
  const insertQuery = db.insert(notificationLog).values(rows).getSQL();

  const result = await db.execute<{ id: number; recipient_id: string | null }>(
    sql`${insertQuery} on conflict (${notificationLogDedupTarget}) do nothing returning "id", "recipient_id"`,
  );

  return result.rows.map((row) => ({ id: row.id, recipientId: row.recipient_id }));
}
