import { getDb } from "../../config/database";
import { teams, teamEntries, leagues } from "@dragons/db/schema";
import { and, eq, sql, inArray } from "drizzle-orm";
import { seasons } from "@dragons/db/schema";
import { fetchLeagueRoster } from "./league-roster";
import { getClubConfig } from "./settings.service";
import type { SdkTeamRef } from "@dragons/sdk";
import { logger } from "../../config/logger";

const log = logger.child({ service: "team-entry-seeding" });

export interface SeedResult {
  entriesSeeded: number;
  rosterFailures: number[];
}

/** Squad upsert for a roster ref — the same shape teams.sync writes, minus hash bookkeeping. */
async function upsertSquad(ref: SdkTeamRef, isOwn: boolean): Promise<number> {
  const [row] = await getDb()
    .insert(teams)
    .values({
      apiTeamPermanentId: ref.teamPermanentId,
      seasonTeamId: ref.seasonTeamId,
      teamCompetitionId: ref.teamCompetitionId,
      name: ref.teamname,
      nameShort: ref.teamnameSmall || null,
      clubId: ref.clubId,
      isOwnClub: isOwn,
      verzicht: ref.verzicht,
    })
    .onConflictDoUpdate({
      target: teams.apiTeamPermanentId,
      set: { isOwnClub: isOwn, updatedAt: new Date() },
    })
    .returning({ id: teams.id });
  if (!row) throw new Error(`Squad upsert returned no row for ${ref.teamPermanentId}`);
  return row.id;
}

export type UpsertEntryOutcome =
  | { action: "created" | "unchanged"; previousSource: null; keptLeagueId?: undefined }
  | { action: "moved"; previousSource: "seeded" | "manual"; keptLeagueId?: undefined }
  | { action: "kept"; previousSource: "seeded" | "manual"; keptLeagueId: number };

/**
 * Point a squad's entry for a season at a league, creating the entry (with
 * carry-forward) if it does not exist. Used by seeding and by the sync
 * (Task 6). Returns what happened so callers can log supersessions.
 *
 * `keepExistingLink` is for ambiguous evidence (a squad found in two committed
 * leagues of one season, issue #228): an entry that already names a league is
 * left exactly as it is and reported as `kept`, so the caller can log the
 * conflict instead of silently flipping the link. A missing or unconnected
 * entry is still written, since a connected league beats none.
 */
export async function upsertEntryFromEvidence(
  teamId: number,
  seasonId: number,
  leagueId: number,
  options: { keepExistingLink?: boolean } = {},
): Promise<UpsertEntryOutcome> {
  const db = getDb();
  const [existing] = await db
    .select({ id: teamEntries.id, leagueId: teamEntries.leagueId, linkSource: teamEntries.linkSource })
    .from(teamEntries)
    .where(and(eq(teamEntries.teamId, teamId), eq(teamEntries.seasonId, seasonId)));

  if (!existing) {
    // Carry-forward from the squad's latest previous entry (color, duration,
    // order — deliberately never the custom name; see ADR 0004).
    // `startDate` is the chronological key — seasons are not guaranteed to be
    // created in chronological order, so ordering by insertion time
    // (createdAt alone) could carry forward the wrong squad's fields when
    // backfilling an older season. createdAt only breaks ties, including for
    // rows whose startDate is null. This is sorted in application code, not
    // SQL: Postgres `ORDER BY ... DESC` is NULLS FIRST, so a season with no
    // start_date (nullable, optional at creation) would otherwise outrank
    // every dated season and win forever. Treat a null startDate as the
    // oldest possible value instead.
    const candidates = await db
      .select({
        badgeColor: teamEntries.badgeColor,
        estimatedGameDuration: teamEntries.estimatedGameDuration,
        displayOrder: teamEntries.displayOrder,
        startDate: seasons.startDate,
        createdAt: teamEntries.createdAt,
      })
      .from(teamEntries)
      .innerJoin(seasons, eq(teamEntries.seasonId, seasons.id))
      .where(eq(teamEntries.teamId, teamId));

    const previous = candidates.sort(
      (a, b) =>
        (b.startDate ?? "").localeCompare(a.startDate ?? "") ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    )[0];

    const displayOrder =
      previous?.displayOrder ??
      ((await db
        .select({ max: sql<number | null>`MAX(${teamEntries.displayOrder})` })
        .from(teamEntries)
        .where(eq(teamEntries.seasonId, seasonId)))[0]?.max ?? -1) + 1;

    await db.insert(teamEntries).values({
      teamId,
      seasonId,
      leagueId,
      linkSource: "seeded",
      badgeColor: previous?.badgeColor ?? null,
      estimatedGameDuration: previous?.estimatedGameDuration ?? null,
      displayOrder,
    });
    return { action: "created", previousSource: null };
  }

  if (existing.leagueId === leagueId) return { action: "unchanged", previousSource: null };

  const previousSource = existing.linkSource === "manual" ? "manual" : "seeded";
  // An unconnected entry has no link to keep, so ambiguous evidence still
  // connects it — a connected league beats none.
  if (options.keepExistingLink && existing.leagueId !== null) {
    return { action: "kept", previousSource, keptLeagueId: existing.leagueId };
  }

  await db
    .update(teamEntries)
    .set({ leagueId, linkSource: "seeded", updatedAt: new Date() })
    .where(eq(teamEntries.id, existing.id));
  return { action: "moved", previousSource };
}

export async function seedSeasonTeamEntries(
  seasonId: number,
  apiLigaIds: number[],
): Promise<SeedResult> {
  const result: SeedResult = { entriesSeeded: 0, rosterFailures: [] };
  const ownClubId = (await getClubConfig())?.clubId ?? null;
  if (ownClubId === null || apiLigaIds.length === 0) return result;

  const leagueRows = await getDb()
    .select({ id: leagues.id, apiLigaId: leagues.apiLigaId })
    .from(leagues)
    .where(and(eq(leagues.seasonRefId, seasonId), inArray(leagues.apiLigaId, apiLigaIds)));
  const dbIdByLigaId = new Map(leagueRows.map((l) => [l.apiLigaId, l.id]));

  for (const ligaId of apiLigaIds) {
    const leagueDbId = dbIdByLigaId.get(ligaId);
    if (leagueDbId === undefined) continue;
    let roster: SdkTeamRef[];
    try {
      roster = await fetchLeagueRoster(ligaId);
    } catch (error) {
      log.warn({ ligaId, err: error }, "Roster fetch failed during seeding; sync will repair");
      result.rosterFailures.push(ligaId);
      continue;
    }
    for (const ref of roster) {
      if (ref.clubId !== ownClubId) continue;
      const teamId = await upsertSquad(ref, true);
      const outcome = await upsertEntryFromEvidence(teamId, seasonId, leagueDbId);
      if (outcome.action !== "unchanged") result.entriesSeeded++;
    }
  }
  return result;
}
