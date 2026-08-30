import type { MatchListItem } from "@dragons/shared";
import { todayInClubZone } from "@dragons/shared";
import { buildSpielplanExportRows } from "./utils";

/**
 * Builds and downloads `spielplan_<club day>.xlsx`. No-op on an empty plan.
 * The `xlsx` library (~400 KB) is imported lazily so it never loads unless
 * someone actually exports.
 */
export async function exportSpielplanXlsx(
  games: readonly MatchListItem[],
  now: Date = new Date(),
): Promise<void> {
  if (games.length === 0) return;

  const XLSX = await import("xlsx");
  const rows = buildSpielplanExportRows(games);
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = Object.keys(rows[0]!).map(() => ({ width: 15 }));
  XLSX.utils.book_append_sheet(workbook, worksheet, "Spielplan");
  XLSX.writeFile(workbook, `spielplan_${todayInClubZone(now)}.xlsx`);
}
