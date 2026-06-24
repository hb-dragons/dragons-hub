import { eq } from "drizzle-orm";
import { getDb } from "../../config/database";
import { seasons } from "@dragons/db/schema";

/**
 * Returns the id of the currently active season, or null if none exists.
 */
export async function getActiveSeasonId(): Promise<number | null> {
  const [row] = await getDb()
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.status, "active"))
    .limit(1);
  return row?.id ?? null;
}
