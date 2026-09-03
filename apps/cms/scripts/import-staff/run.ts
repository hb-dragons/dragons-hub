/**
 * The one-off CMS → Hub trainer import (issue #311, ADR-0008).
 *
 * Every CMS team is matched to a team entry of the *active* season by the
 * team's federation permanent id, and each of its trainers becomes a
 * `team_staff` row with role `trainer`. Portraits stay in the CMS media
 * library — the portrait upload arrives with #310.
 *
 * Re-running is safe: a planned row whose entry already holds that name is
 * dropped, so a partial run can simply be repeated.
 */
import { fetchTeams } from "./cms";
import { activeSeasonEntries, existingStaffKeys, insertStaff, openHub } from "./hub";
import { describeRow, newRows, planStaffRows } from "./mappers";

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const dryRun = argv.includes("--dry-run");

  // The Hub is opened first so a missing DATABASE_URL fails before the whole
  // CMS is paged in; `fetchTeams` throws the same way for its own two.
  const { db, pool } = openHub();
  try {
    const cmsTeams = await fetchTeams();
    console.log(`cms: ${cmsTeams.length} team(s)`);

    const entries = await activeSeasonEntries(db);
    console.log(`hub: ${entries.size} team entr(ies) in the active season`);

    const plan = planStaffRows(cmsTeams, entries);
    for (const note of plan.skipped) console.warn(`  ! ${note}`);

    const touchedEntries = [...new Set(plan.rows.map((row) => row.teamEntryId))];
    const pending = newRows(plan.rows, await existingStaffKeys(db, touchedEntries));

    for (const row of pending) console.log(`  + ${describeRow(row)}`);
    const alreadyThere = plan.rows.length - pending.length;

    if (dryRun) {
      console.log(`dry run: ${pending.length} row(s) would be inserted, ${alreadyThere} already there`);
      return;
    }

    const inserted = await insertStaff(db, pending);
    console.log(`inserted ${inserted} staff row(s), ${alreadyThere} already there`);
  } finally {
    await pool.end();
  }
}
