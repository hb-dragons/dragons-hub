import { db } from "../../config/database";
import { standings } from "@dragons/db/schema";
import { sql } from "drizzle-orm";
import { computeEntityHash } from "./hash";
import type { LeagueFetchedData } from "./data-fetcher";
import type { SyncLogger } from "./sync-logger";

export interface StandingsSyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  durationMs: number;
}

export async function syncStandingsFromData(
  leagueData: LeagueFetchedData[],
  logger?: SyncLogger,
): Promise<StandingsSyncResult> {
  const startedAt = Date.now();
  const result: StandingsSyncResult = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  };

  const now = new Date();
  const allStandingRecords: Array<{
    leagueId: number;
    teamApiId: number;
    position: number;
    played: number;
    won: number;
    lost: number;
    pointsFor: number;
    pointsAgainst: number;
    pointsDiff: number;
    leaguePoints: number;
    dataHash: string;
    lastSyncedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  for (const data of leagueData) {
    if (!data.leagueDbId) {
      result.errors.push(`No DB ID for league API ID ${data.leagueApiId}`);
      continue;
    }

    for (const entry of data.tabelle) {
      const teamApiId = entry.team?.teamPermanentId;
      if (!teamApiId) continue;

      result.total++;

      const hashData: Record<string, unknown> = {
        leagueId: data.leagueDbId,
        teamApiId,
        position: entry.rang,
        played: entry.anzspiele,
        won: entry.s,
        lost: entry.n,
        pointsFor: entry.koerbe,
        pointsAgainst: entry.gegenKoerbe,
        pointsDiff: entry.korbdiff,
        leaguePoints: entry.anzGewinnpunkte,
      };

      allStandingRecords.push({
        leagueId: data.leagueDbId,
        teamApiId,
        position: entry.rang,
        played: entry.anzspiele,
        won: entry.s,
        lost: entry.n,
        pointsFor: entry.koerbe,
        pointsAgainst: entry.gegenKoerbe,
        pointsDiff: entry.korbdiff,
        leaguePoints: entry.anzGewinnpunkte,
        dataHash: computeEntityHash(hashData),
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (allStandingRecords.length === 0) {
    return result;
  }

  console.log(`[Standings Sync] Batch syncing ${allStandingRecords.length} standings...`);

  try {
    const upsertResult = await db
      .insert(standings)
      .values(allStandingRecords)
      .onConflictDoUpdate({
        target: [standings.leagueId, standings.teamApiId],
        set: {
          position: sql`excluded.position`,
          played: sql`excluded.played`,
          won: sql`excluded.won`,
          lost: sql`excluded.lost`,
          pointsFor: sql`excluded.points_for`,
          pointsAgainst: sql`excluded.points_against`,
          pointsDiff: sql`excluded.points_diff`,
          leaguePoints: sql`excluded.league_points`,
          dataHash: sql`excluded.data_hash`,
          lastSyncedAt: now,
          updatedAt: now,
        },
        setWhere: sql`excluded.data_hash != ${standings.dataHash}`,
      })
      .returning({ id: standings.id, createdAt: standings.createdAt });

    for (const row of upsertResult) {
      if (row.createdAt.getTime() === now.getTime()) {
        result.created++;
      } else {
        result.updated++;
      }
    }
    result.skipped = result.total - upsertResult.length - result.failed;

    console.log(`[Standings Sync] Batch synced ${upsertResult.length} standings (${result.created} created, ${result.updated} updated, ${result.skipped} skipped)`);
    await logger?.log({
      entityType: "standing",
      entityId: "batch",
      action: "updated",
      message: `Batch synced ${upsertResult.length} standings (${result.created} created, ${result.updated} updated, ${result.skipped} skipped)`,
      metadata: { created: result.created, updated: result.updated, skipped: result.skipped },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`Batch standings sync failed: ${message}`);
    result.failed = allStandingRecords.length;
    console.error("[Standings Sync] Batch sync error:", error);
    await logger?.log({
      entityType: "standing",
      entityId: "batch",
      action: "failed",
      message: `Batch standings sync failed: ${message}`,
    });
  }

  result.durationMs = Date.now() - startedAt;
  console.log(`[Standings Sync] Completed in ${result.durationMs}ms: ${result.total} total, ${result.errors.length} errors`);

  return result;
}
