import { db } from "../../config/database";
import { leagues } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import pLimit from "p-limit";
import { sdkClient } from "./sdk-client";
import { computeEntityHash } from "./hash";
import type { SdkLigaData } from "@dragons/sdk";
import type { SyncLogger } from "./sync-logger";
import { logger } from "../../config/logger";

const LEAGUE_SYNC_CONCURRENCY = 5;

const log = logger.child({ service: "leagues-sync" });

export interface LeagueSyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  durationMs: number;
}

function ligaDataHashData(ligaData: SdkLigaData): Record<string, unknown> {
  return {
    ligaId: ligaData.ligaId,
    liganr: ligaData.liganr,
    liganame: ligaData.liganame,
    seasonId: ligaData.seasonId,
    seasonName: ligaData.seasonName,
    skName: ligaData.skName,
    akName: ligaData.akName,
    geschlecht: ligaData.geschlecht,
    verbandId: ligaData.verbandId,
    verbandName: ligaData.verbandName,
  };
}

export async function syncLeagues(syncLogger?: SyncLogger): Promise<LeagueSyncResult> {
  const startedAt = Date.now();
  const result: LeagueSyncResult = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    const trackedLeagues = await db
      .select()
      .from(leagues)
      .where(eq(leagues.isTracked, true));

    log.info({ count: trackedLeagues.length }, "Refreshing metadata for tracked leagues");

    const limit = pLimit(LEAGUE_SYNC_CONCURRENCY);
    await Promise.all(
      trackedLeagues.map((league) =>
        limit(() => syncOneLeague(league, result, syncLogger)),
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`Failed to fetch tracked leagues: ${message}`);
    log.error({ err: error }, "Error fetching tracked leagues");
  }

  result.durationMs = Date.now() - startedAt;
  log.info(
    {
      durationMs: result.durationMs,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    },
    "Leagues sync completed",
  );
  return result;
}

async function syncOneLeague(
  league: typeof leagues.$inferSelect,
  result: LeagueSyncResult,
  syncLogger?: SyncLogger,
): Promise<void> {
  result.total++;

  try {
    const tabelleResponse = await sdkClient.getTabelleResponse(league.apiLigaId);
    const ligaData = tabelleResponse?.ligaData;

    if (!ligaData) {
      result.skipped++;
      await syncLogger?.log({
        entityType: "league",
        entityId: String(league.apiLigaId),
        entityName: league.name,
        action: "skipped",
        message: "No ligaData in tabelle response",
      });
      return;
    }

    const hash = computeEntityHash(ligaDataHashData(ligaData));

    if (league.dataHash === hash) {
      result.skipped++;
      await syncLogger?.log({
        entityType: "league",
        entityId: String(league.apiLigaId),
        entityName: league.name,
        action: "skipped",
        message: "No changes detected",
      });
      return;
    }

    await db
      .update(leagues)
      .set({
        ligaNr: ligaData.liganr,
        name: ligaData.liganame || league.name,
        seasonId: ligaData.seasonId,
        seasonName: ligaData.seasonName || league.seasonName,
        skName: ligaData.skName || null,
        akName: ligaData.akName || null,
        geschlecht: ligaData.geschlecht || null,
        verbandId: ligaData.verbandId || null,
        verbandName: ligaData.verbandName || null,
        dataHash: hash,
        updatedAt: new Date(),
      })
      .where(eq(leagues.id, league.id));

    result.updated++;
    await syncLogger?.log({
      entityType: "league",
      entityId: String(league.apiLigaId),
      entityName: ligaData.liganame,
      action: "updated",
      message: `Updated league ${ligaData.liganame}`,
    });
  } catch (error) {
    result.failed++;
    const message = error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`Failed to sync league ${league.apiLigaId}: ${message}`);
    await syncLogger?.log({
      entityType: "league",
      entityId: String(league.apiLigaId),
      entityName: league.name,
      action: "failed",
      message: `Failed to sync league: ${message}`,
    });
  }
}
