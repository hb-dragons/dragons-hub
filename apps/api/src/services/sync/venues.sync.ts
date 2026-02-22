import { db } from "../../config/database";
import { venues } from "@dragons/db/schema";
import { sql } from "drizzle-orm";
import { computeEntityHash } from "./hash";
import type { SdkSpielfeld } from "@dragons/sdk";
import type { SyncLogger } from "./sync-logger";

export interface VenuesSyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  durationMs: number;
}

function venueHashData(spielfeld: SdkSpielfeld): Record<string, unknown> {
  return {
    id: spielfeld.id,
    bezeichnung: spielfeld.bezeichnung,
    strasse: spielfeld.strasse,
    plz: spielfeld.plz,
    ort: spielfeld.ort,
  };
}

export async function syncVenuesFromData(
  venuesMap: Map<number, SdkSpielfeld>,
  logger?: SyncLogger,
): Promise<VenuesSyncResult> {
  const startedAt = Date.now();
  const result: VenuesSyncResult = {
    total: venuesMap.size,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  };

  if (venuesMap.size === 0) {
    return result;
  }

  console.log(`[Venues Sync] Batch syncing ${venuesMap.size} unique venues...`);

  const now = new Date();

  const venueRecords = Array.from(venuesMap.entries()).map(([apiId, spielfeld]) => ({
    apiId,
    name: spielfeld.bezeichnung?.trim() || `Venue ${apiId}`,
    street: spielfeld.strasse || null,
    postalCode: spielfeld.plz || null,
    city: spielfeld.ort || null,
    dataHash: computeEntityHash(venueHashData(spielfeld)),
    createdAt: now,
    updatedAt: now,
  }));

  try {
    const upsertResult = await db
      .insert(venues)
      .values(venueRecords)
      .onConflictDoUpdate({
        target: venues.apiId,
        set: {
          name: sql`excluded.name`,
          street: sql`excluded.street`,
          postalCode: sql`excluded.postal_code`,
          city: sql`excluded.city`,
          dataHash: sql`excluded.data_hash`,
          updatedAt: now,
        },
        setWhere: sql`excluded.data_hash != ${venues.dataHash}`,
      })
      .returning({ id: venues.id, createdAt: venues.createdAt });

    for (const row of upsertResult) {
      if (row.createdAt.getTime() === now.getTime()) {
        result.created++;
      } else {
        result.updated++;
      }
    }
    result.skipped = result.total - upsertResult.length - result.failed;

    console.log(`[Venues Sync] Batch synced ${upsertResult.length} venues (${result.created} created, ${result.updated} updated, ${result.skipped} skipped)`);
    await logger?.log({
      entityType: "venue",
      entityId: "batch",
      action: "updated",
      message: `Batch synced ${upsertResult.length} venues (${result.created} created, ${result.updated} updated, ${result.skipped} skipped)`,
      metadata: { created: result.created, updated: result.updated, skipped: result.skipped },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`Batch venue sync failed: ${message}`);
    result.failed = venuesMap.size;
    console.error("[Venues Sync] Batch sync error:", error);
    await logger?.log({
      entityType: "venue",
      entityId: "batch",
      action: "failed",
      message: `Batch venue sync failed: ${message}`,
    });
  }

  result.durationMs = Date.now() - startedAt;
  console.log(`[Venues Sync] Completed in ${result.durationMs}ms: ${result.total} total, ${result.errors.length} errors`);

  return result;
}

export async function buildVenueIdLookup(): Promise<Map<number, number>> {
  const allVenues = await db
    .select({ id: venues.id, apiId: venues.apiId })
    .from(venues);
  return new Map(allVenues.map((v) => [v.apiId, v.id]));
}
