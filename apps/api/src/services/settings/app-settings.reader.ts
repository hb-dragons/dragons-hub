import { getDb } from "../../config/database";
import { appSettings } from "@dragons/db/schema";
import { inArray } from "drizzle-orm";

/**
 * Shared reader for the `app_settings` key/value table.
 *
 * Both the admin settings service and the venue-booking service used to read
 * their keys with their own copy of "select one row per key, then parseInt with
 * a fallback". The admin copy issued one round trip per key; this one fetches
 * the whole set in a single `inArray` query and both callers parse it the same
 * way.
 */

/** Fetch the given keys in one query. Keys with no row are absent from the map. */
export async function readSettings(keys: readonly string[]): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();

  const rows = await getDb()
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, [...keys]));

  return new Map(rows.map((r) => [r.key, r.value]));
}

/**
 * Read a numeric setting out of a map from `readSettings`. Falls back when the
 * key is missing or its stored text is not a number, so a hand-edited row can
 * never turn a buffer or duration into NaN.
 */
export function readIntSetting(
  values: Map<string, string>,
  key: string,
  fallback: number,
): number {
  const raw = values.get(key);
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
