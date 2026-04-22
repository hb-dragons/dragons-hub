import { db } from "../../config/database";
import { appSettings } from "@dragons/db/schema";
import { inArray } from "drizzle-orm";
import type { HistoryDateRange } from "@dragons/shared";

export async function resolveHistoryDateRange(
  from?: string,
  to?: string,
): Promise<HistoryDateRange> {
  if (from && to) return { from, to, source: "user" };

  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, ["currentSeasonStart", "currentSeasonEnd"]));

  const settingsFrom = rows.find((r) => r.key === "currentSeasonStart")?.value;
  const settingsTo = rows.find((r) => r.key === "currentSeasonEnd")?.value;
  if (settingsFrom && settingsTo) {
    return { from: settingsFrom, to: settingsTo, source: "settings" };
  }

  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const startYear = month >= 8 ? year : year - 1;
  return {
    from: `${startYear}-08-01`,
    to: `${startYear + 1}-07-31`,
    source: "default",
  };
}
