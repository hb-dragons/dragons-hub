import { db } from "../../config/database";
import { referees, refereeRoles, matchReferees, matches } from "@dragons/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { computeEntityHash } from "./hash";
import type {
  ExtractedReferee,
  ExtractedRefereeRole,
  ExtractedRefereeAssignment,
} from "./data-fetcher";
import { batchAction, type SyncLogger } from "./sync-logger";
import { logger } from "../../config/logger";

const log = logger.child({ service: "referees-sync" });

export interface RefereesSyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  durationMs: number;
}

export interface RefereeRolesSyncResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  roleIdLookup: Map<number, number>;
}

export async function syncRefereeRolesFromData(
  rolesMap: Map<number, ExtractedRefereeRole>,
  logger?: SyncLogger,
): Promise<RefereeRolesSyncResult> {
  if (rolesMap.size === 0) {
    return { created: 0, updated: 0, skipped: 0, failed: 0, roleIdLookup: new Map() };
  }

  log.info({ count: rolesMap.size }, "Batch syncing referee roles");

  const now = new Date();
  const roleRecords = Array.from(rolesMap.entries()).map(([apiId, role]) => ({
    apiId,
    name: role.schirirollename,
    shortName: role.schirirollekurzname,
    dataHash: computeEntityHash({ apiId, name: role.schirirollename, shortName: role.schirirollekurzname }),
    createdAt: now,
    updatedAt: now,
  }));

  try {
    const upsertResult = await db
      .insert(refereeRoles)
      .values(roleRecords)
      .onConflictDoUpdate({
        target: refereeRoles.apiId,
        set: {
          name: sql`excluded.name`,
          shortName: sql`excluded.short_name`,
          dataHash: sql`excluded.data_hash`,
          updatedAt: now,
        },
        setWhere: sql`excluded.data_hash != ${refereeRoles.dataHash}`,
      })
      .returning({ id: refereeRoles.id, apiId: refereeRoles.apiId, createdAt: refereeRoles.createdAt });

    let created = 0;
    let updated = 0;
    for (const row of upsertResult) {
      if (row.createdAt.getTime() === now.getTime()) {
        created++;
      } else {
        updated++;
      }
    }
    const skipped = rolesMap.size - upsertResult.length;

    log.info({ total: upsertResult.length, created, updated, skipped }, "Batch synced referee roles");
    await logger?.log({
      entityType: "refereeRole",
      entityId: "batch",
      action: batchAction(created, updated, 0),
      message: `Batch synced ${upsertResult.length} referee roles (${created} created, ${updated} updated, ${skipped} skipped)`,
      metadata: { created, updated, skipped },
    });
    const roleIdLookup = new Map(upsertResult.map((r) => [r.apiId, r.id]));
    return { created, updated, skipped, failed: 0, roleIdLookup };
  } catch (error) {
    log.error({ err: error }, "Batch role sync failed");
    await logger?.log({
      entityType: "refereeRole",
      entityId: "batch",
      action: "failed",
      message: `Batch role sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
    return { created: 0, updated: 0, skipped: 0, failed: rolesMap.size, roleIdLookup: new Map() };
  }
}

export async function syncRefereesFromData(
  refereesMap: Map<number, ExtractedReferee>,
  logger?: SyncLogger,
): Promise<{
  created: number;
  updated: number;
  skipped: number;
  refereeIdLookup: Map<number, number>;
  errors: string[];
}> {
  const errors: string[] = [];

  if (refereesMap.size === 0) {
    return { created: 0, updated: 0, skipped: 0, refereeIdLookup: new Map(), errors };
  }

  log.info({ count: refereesMap.size }, "Batch syncing referees");

  const now = new Date();
  const refereeRecords = Array.from(refereesMap.entries()).map(([apiId, referee]) => ({
    apiId,
    firstName: referee.vorname,
    lastName: referee.nachname,
    licenseNumber: referee.lizenznummer,
    dataHash: computeEntityHash({
      apiId,
      firstName: referee.vorname,
      lastName: referee.nachname,
      licenseNumber: referee.lizenznummer,
    }),
    createdAt: now,
    updatedAt: now,
  }));

  try {
    const upsertResult = await db
      .insert(referees)
      .values(refereeRecords)
      .onConflictDoUpdate({
        target: referees.apiId,
        set: {
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          licenseNumber: sql`excluded.license_number`,
          dataHash: sql`excluded.data_hash`,
          updatedAt: now,
        },
        setWhere: sql`excluded.data_hash != ${referees.dataHash}`,
      })
      .returning({ id: referees.id, apiId: referees.apiId, createdAt: referees.createdAt });

    let created = 0;
    let updated = 0;
    for (const row of upsertResult) {
      if (row.createdAt.getTime() === now.getTime()) {
        created++;
      } else {
        updated++;
      }
    }
    const skipped = refereesMap.size - upsertResult.length;

    log.info({ total: upsertResult.length, created, updated, skipped }, "Batch synced referees");
    await logger?.log({
      entityType: "referee",
      entityId: "batch",
      action: batchAction(created, updated, 0),
      message: `Batch synced ${upsertResult.length} referees (${created} created, ${updated} updated, ${skipped} skipped)`,
      metadata: { created, updated, skipped },
    });
    const refereeIdLookup = new Map(upsertResult.map((r) => [r.apiId, r.id]));
    return { created, updated, skipped, refereeIdLookup, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(`Batch referee sync failed: ${message}`);
    log.error({ err: error }, "Batch referee sync failed");
    await logger?.log({
      entityType: "referee",
      entityId: "batch",
      action: "failed",
      message: `Batch referee sync failed: ${message}`,
    });
    return { created: 0, updated: 0, skipped: 0, refereeIdLookup: new Map(), errors };
  }
}

export async function buildMatchIdLookup(): Promise<Map<number, number>> {
  const allMatches = await db
    .select({ id: matches.id, apiMatchId: matches.apiMatchId })
    .from(matches);
  return new Map(allMatches.map((m) => [m.apiMatchId, m.id]));
}

export async function syncRefereeAssignmentsFromData(
  assignments: ExtractedRefereeAssignment[],
  refereeIdLookup: Map<number, number>,
  roleIdLookup: Map<number, number>,
  matchIdLookup: Map<number, number>,
  logger?: SyncLogger,
): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;

  if (assignments.length === 0) {
    return { created: 0, errors };
  }

  log.info({ count: assignments.length }, "Processing referee assignments");

  const validAssignments = assignments.filter((a) => {
    const matchId = matchIdLookup.get(a.matchApiId);
    const refereeId = refereeIdLookup.get(a.schiedsrichterId);
    const roleId = roleIdLookup.get(a.schirirolleId);
    return matchId && refereeId && roleId;
  });

  if (validAssignments.length === 0) {
    log.info("No valid assignments to sync");
    return { created: 0, errors };
  }

  const now = new Date();

  for (const assignment of validAssignments) {
    const matchId = matchIdLookup.get(assignment.matchApiId)!;
    const refereeId = refereeIdLookup.get(assignment.schiedsrichterId)!;
    const roleId = roleIdLookup.get(assignment.schirirolleId)!;

    try {
      const [existing] = await db
        .select()
        .from(matchReferees)
        .where(
          and(
            eq(matchReferees.matchId, matchId),
            eq(matchReferees.refereeId, refereeId),
            eq(matchReferees.roleId, roleId),
          ),
        )
        .limit(1);

      if (!existing) {
        await db.insert(matchReferees).values({
          matchId,
          refereeId,
          roleId,
          createdAt: now,
        });
        created++;
        await logger?.log({
          entityType: "referee",
          entityId: `${matchId}-${refereeId}-${roleId}`,
          action: "created",
          message: `Created referee assignment for match ${matchId}`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Failed to sync assignment for match ${matchId}: ${message}`);
      await logger?.log({
        entityType: "referee",
        entityId: `${matchId}-${refereeId}-${roleId}`,
        action: "failed",
        message: `Failed to sync assignment: ${message}`,
      });
    }
  }

  log.info({ created }, "Created referee assignments");
  return { created, errors };
}
