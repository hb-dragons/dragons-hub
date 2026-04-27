import { db } from "../../config/database";
import { teams } from "@dragons/db/schema";
import { sql, and, eq, ne, inArray } from "drizzle-orm";
import { computeEntityHash } from "./hash";
import { getClubConfig } from "../admin/settings.service";
import type { SdkTeamRef } from "@dragons/sdk";
import { batchAction, type SyncLogger } from "./sync-logger";
import { logger } from "../../config/logger";

const log = logger.child({ service: "teams-sync" });

export interface TeamsSyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  durationMs: number;
}

function teamHashData(teamRef: SdkTeamRef): Record<string, unknown> {
  return {
    teamPermanentId: teamRef.teamPermanentId,
    seasonTeamId: teamRef.seasonTeamId,
    teamCompetitionId: teamRef.teamCompetitionId,
    teamname: teamRef.teamname,
    teamnameSmall: teamRef.teamnameSmall,
    clubId: teamRef.clubId,
    verzicht: teamRef.verzicht,
  };
}

async function getMaxOwnDisplayOrder(): Promise<number> {
  const [row] = await db
    .select({ maxOrder: sql<number | null>`MAX(${teams.displayOrder})` })
    .from(teams)
    .where(eq(teams.isOwnClub, true));
  return row?.maxOrder ?? -1;
}

export async function syncTeamsFromData(
  teamsMap: Map<number, SdkTeamRef>,
  logger?: SyncLogger,
): Promise<TeamsSyncResult> {
  const startedAt = Date.now();
  const result: TeamsSyncResult = {
    total: teamsMap.size,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  };

  if (teamsMap.size === 0) {
    return result;
  }

  log.info({ count: teamsMap.size }, "Batch syncing unique teams");

  const clubConfig = await getClubConfig();
  const ownClubId = clubConfig?.clubId ?? 0;
  const now = new Date();

  // Find which teamPermanentIds are already in the DB so we know which inserts are new
  // and whether isOwnClub is about to flip
  const refIds = Array.from(teamsMap.keys());
  const existing = await db
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId, isOwnClub: teams.isOwnClub })
    .from(teams)
    .where(inArray(teams.apiTeamPermanentId, refIds));
  const existingMap = new Map(existing.map((e) => [e.apiTeamPermanentId, e.isOwnClub]));

  // Compute next available displayOrder for own-club inserts
  let nextOrder = (await getMaxOwnDisplayOrder()) + 1;

  // Track which existing rows are flipping from false → true (need max+1 post-upsert)
  const flippingToOwnIds = new Set<number>();

  const teamRecords = Array.from(teamsMap.entries()).map(([permanentId, teamRef]) => {
    const isOwn = teamRef.clubId === ownClubId;
    const wasInDb = existingMap.has(permanentId);
    const wasOwn = existingMap.get(permanentId) ?? false;
    const isNew = !wasInDb;
    const displayOrder = isNew && isOwn ? nextOrder++ : 0;
    if (!isNew && isOwn && !wasOwn) {
      flippingToOwnIds.add(permanentId);
    }
    return {
      apiTeamPermanentId: permanentId,
      seasonTeamId: teamRef.seasonTeamId,
      teamCompetitionId: teamRef.teamCompetitionId,
      name: teamRef.teamname,
      nameShort: teamRef.teamnameSmall || null,
      clubId: teamRef.clubId,
      isOwnClub: isOwn,
      verzicht: teamRef.verzicht,
      displayOrder,
      dataHash: computeEntityHash(teamHashData(teamRef)),
      createdAt: now,
      updatedAt: now,
    };
  });

  try {
    const upsertResult = await db
      .insert(teams)
      .values(teamRecords)
      .onConflictDoUpdate({
        target: teams.apiTeamPermanentId,
        set: {
          seasonTeamId: sql`excluded.season_team_id`,
          teamCompetitionId: sql`excluded.team_competition_id`,
          name: sql`excluded.name`,
          nameShort: sql`excluded.name_short`,
          clubId: sql`excluded.club_id`,
          isOwnClub: sql`excluded.is_own_club`,
          verzicht: sql`excluded.verzicht`,
          // Reset displayOrder to 0 when flipping from own to non-own; otherwise keep existing
          displayOrder: sql`CASE WHEN excluded.is_own_club = false AND ${teams.isOwnClub} = true THEN 0 ELSE ${teams.displayOrder} END`,
          dataHash: sql`excluded.data_hash`,
          updatedAt: now,
        },
        setWhere: sql`excluded.data_hash != ${teams.dataHash}`,
      })
      .returning({ id: teams.id, createdAt: teams.createdAt });

    for (const row of upsertResult) {
      if (row.createdAt.getTime() === now.getTime()) {
        result.created++;
      } else {
        result.updated++;
      }
    }
    result.skipped = result.total - upsertResult.length - result.failed;

    log.info({ total: upsertResult.length, created: result.created, updated: result.updated, skipped: result.skipped }, "Batch synced teams");
    await logger?.log({
      entityType: "team",
      entityId: "batch",
      action: batchAction(result.created, result.updated, result.failed),
      message: `Batch synced ${upsertResult.length} teams (${result.created} created, ${result.updated} updated, ${result.skipped} skipped)`,
      metadata: { created: result.created, updated: result.updated, skipped: result.skipped },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`Batch team sync failed: ${message}`);
    result.failed = teamsMap.size;
    log.error({ err: error }, "Batch sync error");
    await logger?.log({
      entityType: "team",
      entityId: "batch",
      action: "failed",
      message: `Batch team sync failed: ${message}`,
    });
  }

  // Corrective pass: fix isOwnClub for teams whose hash didn't change (upsert skipped them)
  if (ownClubId > 0) {
    // Flip-to-true (hash-skipped rows): find own-club rows still marked as non-own
    const toMarkOwn = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.clubId, ownClubId), eq(teams.isOwnClub, false)));

    // Also assign max+1 to rows that were flipped to own via the upsert (hash changed)
    // These are rows in flippingToOwnIds — their isOwnClub is now true but displayOrder is still 0
    const flippedViaUpsert = flippingToOwnIds.size > 0
      ? await db
          .select({ id: teams.id })
          .from(teams)
          .where(inArray(teams.apiTeamPermanentId, Array.from(flippingToOwnIds)))
      : [];

    let nextCorrectionOrder = (await getMaxOwnDisplayOrder()) + 1;

    // Process hash-skipped flip-to-true rows (set isOwnClub + displayOrder)
    for (const row of toMarkOwn) {
      await db
        .update(teams)
        .set({
          isOwnClub: true,
          displayOrder: nextCorrectionOrder++,
          updatedAt: now,
        })
        .where(eq(teams.id, row.id));
    }

    // Process upsert-flipped-to-true rows (isOwnClub already true, just set displayOrder)
    for (const row of flippedViaUpsert) {
      await db
        .update(teams)
        .set({
          displayOrder: nextCorrectionOrder++,
          updatedAt: now,
        })
        .where(eq(teams.id, row.id));
    }

    // Flip-to-false: reset displayOrder to 0 in a single bulk UPDATE (hash-skipped rows only;
    // upsert already reset displayOrder via the CASE expression for hash-changed rows)
    const unmarkOwn = await db
      .update(teams)
      .set({ isOwnClub: false, displayOrder: 0, updatedAt: now })
      .where(and(ne(teams.clubId, ownClubId), eq(teams.isOwnClub, true)))
      .returning({ id: teams.id });

    const totalMarked = toMarkOwn.length + flippedViaUpsert.length;
    if (totalMarked > 0 || unmarkOwn.length > 0) {
      log.info({ marked: totalMarked, unmarked: unmarkOwn.length }, "Corrected isOwnClub");
    }
  }

  result.durationMs = Date.now() - startedAt;
  log.info({ durationMs: result.durationMs, total: result.total, errors: result.errors.length }, "Teams sync completed");

  return result;
}

export async function buildTeamIdLookup(): Promise<Map<number, number>> {
  const allTeams = await db
    .select({ id: teams.id, apiTeamPermanentId: teams.apiTeamPermanentId })
    .from(teams);
  return new Map(allTeams.map((t) => [t.apiTeamPermanentId, t.id]));
}
