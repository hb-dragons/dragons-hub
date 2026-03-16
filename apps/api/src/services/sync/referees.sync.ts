import { db } from "../../config/database";
import { referees, refereeRoles, matchReferees, matches, refereeAssignmentIntents } from "@dragons/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { computeEntityHash } from "./hash";
import type {
  ExtractedReferee,
  ExtractedRefereeRole,
  ExtractedRefereeAssignment,
} from "./data-fetcher";
import { batchAction, type SyncLogger } from "./sync-logger";
import { logger } from "../../config/logger";
import { publishDomainEvent } from "../events/event-publisher";
import { EVENT_TYPES } from "@dragons/shared";

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

  // Pre-load existing roles for lookup (before upsert)
  const existingRoles = await db
    .select({ id: refereeRoles.id, apiId: refereeRoles.apiId })
    .from(refereeRoles);
  const roleIdLookup = new Map(existingRoles.map((r) => [r.apiId, r.id]));

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
    // Merge upsert results into pre-loaded lookup
    for (const row of upsertResult) {
      roleIdLookup.set(row.apiId, row.id);
    }
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

  // Pre-load existing referees for lookup (before upsert)
  const existingRefs = await db
    .select({ id: referees.id, apiId: referees.apiId })
    .from(referees);
  const refereeIdLookup = new Map(existingRefs.map((r) => [r.apiId, r.id]));

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
    // Merge upsert results into pre-loaded lookup
    for (const row of upsertResult) {
      refereeIdLookup.set(row.apiId, row.id);
    }
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

/** Helper to look up referee name by internal ID */
async function getRefereeNameById(refId: number): Promise<string> {
  const [ref] = await db
    .select({ firstName: referees.firstName, lastName: referees.lastName })
    .from(referees)
    .where(eq(referees.id, refId))
    .limit(1);
  return ref ? `${ref.firstName} ${ref.lastName}`.trim() : "Unknown";
}

/** Helper to look up match info for referee event payloads */
async function getMatchInfoForEvent(matchId: number): Promise<{
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  entityName: string;
  teamIds: number[];
} | null> {
  const [match] = await db
    .select({
      matchNo: matches.matchNo,
      homeTeamApiId: matches.homeTeamApiId,
      guestTeamApiId: matches.guestTeamApiId,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) return null;

  // We don't have team names readily available here, use API IDs as placeholders
  return {
    matchNo: match.matchNo,
    homeTeam: String(match.homeTeamApiId),
    guestTeam: String(match.guestTeamApiId),
    entityName: `Match #${match.matchNo}`,
    teamIds: [match.homeTeamApiId, match.guestTeamApiId],
  };
}

/** Helper to look up role name by internal ID */
async function getRoleNameById(roleId: number): Promise<string> {
  const [role] = await db
    .select({ name: refereeRoles.name })
    .from(refereeRoles)
    .where(eq(refereeRoles.id, roleId))
    .limit(1);
  return role?.name ?? "Unknown";
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

  // Batch-load existing assignments to avoid N+1 SELECTs
  const matchIdsToCheck = [...new Set(validAssignments.map((a) => matchIdLookup.get(a.matchApiId)!))];
  const existingAssignments = matchIdsToCheck.length > 0
    ? await db
        .select()
        .from(matchReferees)
        .where(inArray(matchReferees.matchId, matchIdsToCheck))
    : [];
  const existingBySlot = new Map(
    existingAssignments.map((r) => [`${r.matchId}-${r.slotNumber}`, r]),
  );

  for (const assignment of validAssignments) {
    const matchId = matchIdLookup.get(assignment.matchApiId)!;
    const refereeId = refereeIdLookup.get(assignment.schiedsrichterId)!;
    const roleId = roleIdLookup.get(assignment.schirirolleId)!;

    const { slotNumber } = assignment;

    try {
      const existing = existingBySlot.get(`${matchId}-${slotNumber}`) ?? null;

      if (!existing) {
        await db.insert(matchReferees).values({
          matchId,
          refereeId,
          roleId,
          slotNumber,
          createdAt: now,
        });
        created++;

        // Emit referee.assigned event
        try {
          const [refName, matchInfo, roleName] = await Promise.all([
            getRefereeNameById(refereeId),
            getMatchInfoForEvent(matchId),
            getRoleNameById(roleId),
          ]);
          if (matchInfo) {
            await publishDomainEvent({
              type: EVENT_TYPES.REFEREE_ASSIGNED,
              source: "sync",
              entityType: "referee",
              entityId: matchId,
              entityName: matchInfo.entityName,
              deepLinkPath: `/admin/matches/${matchId}`,
              payload: {
                matchNo: matchInfo.matchNo,
                homeTeam: matchInfo.homeTeam,
                guestTeam: matchInfo.guestTeam,
                refereeName: refName,
                role: roleName,
                refereeId,
                teamIds: matchInfo.teamIds,
              },
            });
          }
        } catch (error) {
          log.warn({ err: error, matchId, refereeId }, "Failed to emit referee.assigned event");
        }

        await logger?.log({
          entityType: "referee",
          entityId: `${matchId}-${refereeId}-${roleId}`,
          action: "created",
          message: `Created referee assignment for match ${matchId} slot ${slotNumber}`,
        });
      } else if (existing.refereeId !== refereeId || existing.roleId !== roleId) {
        const oldRefereeId = existing.refereeId;

        await db
          .update(matchReferees)
          .set({ refereeId, roleId })
          .where(eq(matchReferees.id, existing.id));

        // Emit referee.reassigned event when referee changed
        if (oldRefereeId !== refereeId) {
          try {
            const [oldRefName, newRefName, matchInfo, roleName] = await Promise.all([
              getRefereeNameById(oldRefereeId),
              getRefereeNameById(refereeId),
              getMatchInfoForEvent(matchId),
              getRoleNameById(roleId),
            ]);
            if (matchInfo) {
              await publishDomainEvent({
                type: EVENT_TYPES.REFEREE_REASSIGNED,
                source: "sync",
                entityType: "referee",
                entityId: matchId,
                entityName: matchInfo.entityName,
                deepLinkPath: `/admin/matches/${matchId}`,
                payload: {
                  matchNo: matchInfo.matchNo,
                  homeTeam: matchInfo.homeTeam,
                  guestTeam: matchInfo.guestTeam,
                  oldRefereeName: oldRefName,
                  newRefereeName: newRefName,
                  role: roleName,
                  oldRefereeId: oldRefereeId,
                  newRefereeId: refereeId,
                  teamIds: matchInfo.teamIds,
                },
              });
            }
          } catch (error) {
            log.warn({ err: error, matchId, refereeId }, "Failed to emit referee.reassigned event");
          }
        }
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

export async function confirmIntentsFromSync(): Promise<number> {
  const now = new Date();

  // Single query: update all pending intents that have a matching assignment
  const result = await db.execute(sql`
    UPDATE ${refereeAssignmentIntents}
    SET confirmed_by_sync_at = ${now}
    WHERE ${refereeAssignmentIntents.confirmedBySyncAt} IS NULL
      AND EXISTS (
        SELECT 1 FROM ${matchReferees} mr
        WHERE mr.match_id = ${refereeAssignmentIntents}.match_id
          AND mr.referee_id = ${refereeAssignmentIntents}.referee_id
      )
  `);

  return Number(result.rowCount ?? 0);
}
