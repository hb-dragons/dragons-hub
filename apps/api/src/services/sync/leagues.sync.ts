import { db } from "../../config/database";
import { leagues } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { sdkClient } from "./sdk-client";
import { computeEntityHash } from "./hash";
import type { SdkLigaData } from "@dragons/sdk";
import type { SyncLogger } from "./sync-logger";

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

export async function syncLeagues(logger?: SyncLogger): Promise<LeagueSyncResult> {
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

    console.log(`[Leagues Sync] Refreshing metadata for ${trackedLeagues.length} tracked leagues`);

    for (const league of trackedLeagues) {
      result.total++;

      try {
        const tabelleResponse = await sdkClient.getTabelleResponse(league.apiLigaId);
        const ligaData = tabelleResponse?.ligaData;

        if (!ligaData) {
          result.skipped++;
          await logger?.log({
            entityType: "league",
            entityId: String(league.apiLigaId),
            entityName: league.name,
            action: "skipped",
            message: "No ligaData in tabelle response",
          });
          continue;
        }

        const hash = computeEntityHash(ligaDataHashData(ligaData));

        if (league.dataHash === hash) {
          result.skipped++;
          await logger?.log({
            entityType: "league",
            entityId: String(league.apiLigaId),
            entityName: league.name,
            action: "skipped",
            message: "No changes detected",
          });
          continue;
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
        await logger?.log({
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
        await logger?.log({
          entityType: "league",
          entityId: String(league.apiLigaId),
          entityName: league.name,
          action: "failed",
          message: `Failed to sync league: ${message}`,
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`Failed to fetch tracked leagues: ${message}`);
    console.error("[Leagues Sync] Error:", message);
  }

  result.durationMs = Date.now() - startedAt;
  console.log(
    `[Leagues Sync] Completed in ${result.durationMs}ms: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`,
  );

  return result;
}
