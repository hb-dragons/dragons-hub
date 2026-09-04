/**
 * The one-off CMS → Hub trainer import (issue #311, ADR-0008), in two passes:
 *
 *   `migrate:cms-staff`               every CMS team is matched to a team
 *                                     entry of the *active* season by the
 *                                     team's federation permanent id, and each
 *                                     of its trainers becomes a `team_staff`
 *                                     row with role `trainer`.
 *   `migrate:cms-staff -- --portraits` (issue #329) copies each imported row's
 *                                     portrait out of the CMS media library —
 *                                     the trainer's own image first, else the
 *                                     person's — normalised the way the Hub's
 *                                     upload path normalises it, into the
 *                                     Hub's asset bucket under a fresh uuid,
 *                                     and records the object name on the row.
 *                                     Needs `GCS_BUCKET_NAME` and Application
 *                                     Default Credentials on top of the first
 *                                     pass's variables.
 *
 * Re-running either pass is safe: a planned row whose entry already holds
 * that name, and a row that already carries a portrait, are left alone, so a
 * partial run can simply be repeated. The one gap: a copy that uploaded but
 * failed to record leaves an unreferenced object in the bucket, which the
 * rerun neither reuses nor removes.
 */
import type { Database } from "@dragons/db";

import { downloadMedia, fetchTeams, mediaUrl } from "./cms";
import {
  activeSeasonEntries,
  existingStaff,
  existingStaffKeys,
  insertStaff,
  openHub,
  setStaffPortrait,
} from "./hub";
import { describePortrait, describeRow, newRows, planPortraits, planStaffRows } from "./mappers";
import { openBucket, storePortrait } from "./storage";

async function importStaff(db: Database, dryRun: boolean): Promise<void> {
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
}

async function importPortraits(db: Database, dryRun: boolean): Promise<void> {
  // The bucket is opened first for the same reason the Hub is: a missing
  // GCS_BUCKET_NAME should fail before the whole CMS is paged in. Opening
  // touches no network — credentials are resolved on the first upload.
  const bucket = openBucket();

  const cmsTeams = await fetchTeams();
  console.log(`cms: ${cmsTeams.length} team(s)`);

  const entries = await activeSeasonEntries(db);
  console.log(`hub: ${entries.size} team entr(ies) in the active season`);

  const plan = planPortraits(cmsTeams, entries, await existingStaff(db, [...entries.values()]));
  for (const note of plan.skipped) console.warn(`  ! ${note}`);
  for (const copy of plan.copies) {
    console.log(`  + ${describePortrait(copy)} <- ${mediaUrl(copy.sourceUrl)}`);
  }

  if (dryRun) {
    console.log(
      `dry run: ${plan.copies.length} portrait(s) would be copied, ${plan.alreadyThere} already there`,
    );
    return;
  }

  // Sequential on purpose, like the Strapi media migration: a handful of
  // files, and a failure mid-way should stop the run rather than leave a
  // scatter of half-finished copies to reason about — a rerun picks up
  // exactly where this one stopped, because every recorded row is skipped.
  let copied = 0;
  for (const copy of plan.copies) {
    const bytes = await downloadMedia(copy.sourceUrl);
    const filename = await storePortrait(bucket, bytes, copy.contentType);
    await setStaffPortrait(db, copy.staffId, filename);
    copied += 1;
    console.log(`  = staff ${copy.staffId} -> ${filename}`);
  }
  console.log(`copied ${copied} portrait(s), ${plan.alreadyThere} already there`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const portraits = argv.includes("--portraits");

  // The Hub is opened first so a missing DATABASE_URL fails before the whole
  // CMS is paged in; `fetchTeams` throws the same way for its own two.
  const { db, pool } = openHub();
  try {
    if (portraits) await importPortraits(db, dryRun);
    else await importStaff(db, dryRun);
  } finally {
    await pool.end();
  }
}
