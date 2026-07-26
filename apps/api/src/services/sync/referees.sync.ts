import { getDb } from "../../config/database";
import { referees, refereeRoles, matchReferees, matches, matchChanges, refereeAssignmentIntents, refereeGames, teams } from "@dragons/db/schema";
import { and, eq, isNull, sql, inArray } from "drizzle-orm";
import { computeEntityHash } from "./hash";
import type {
  ExtractedReferee,
  ExtractedRefereeRole,
  ExtractedRefereeAssignment,
  LeagueFetchedData,
} from "./data-fetcher";
import {
  assessGameDetailCoverage,
  evaluateFetchCoverage,
  evaluateRemovalBlastRadius,
} from "./removal-guard";
import { batchAction, type SyncLogger } from "./sync-logger";
import { logger } from "../../config/logger";
import { publishDomainEvent } from "../events/event-publisher";
import { EVENT_TYPES } from "@dragons/shared";

const log = logger.child({ service: "referees-sync" });

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
  const existingRoles = await getDb()
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
    const upsertResult = await getDb()
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
  const existingRefs = await getDb()
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
    const upsertResult = await getDb()
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
  const allMatches = await getDb()
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
  syncRunId?: number | null,
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
    ? await getDb()
        .select()
        .from(matchReferees)
        // Tombstoned rows (issue #105) must not shadow a slot: a referee who
        // comes back to a slot they were dropped from has to insert a fresh
        // live row, not resurrect the history entry.
        .where(and(inArray(matchReferees.matchId, matchIdsToCheck), isNull(matchReferees.removedAt)))
    : [];
  const existingBySlot = new Map(
    existingAssignments.map((r) => [`${r.matchId}-${r.slotNumber}`, r]),
  );

  // Batch-load referee names, match info, and role names for event emission
  const allRefereeIds = [...new Set([
    ...validAssignments.map((a) => refereeIdLookup.get(a.schiedsrichterId)!),
    ...existingAssignments.map((a) => a.refereeId),
  ])];
  const allRoleIds = [...new Set(validAssignments.map((a) => roleIdLookup.get(a.schirirolleId)!))];

  const [refRows, matchRows, roleRows] = await Promise.all([
    allRefereeIds.length > 0
      ? getDb().select({ id: referees.id, firstName: referees.firstName, lastName: referees.lastName })
          .from(referees).where(inArray(referees.id, allRefereeIds))
      : Promise.resolve([]),
    matchIdsToCheck.length > 0
      ? getDb().select({ id: matches.id, matchNo: matches.matchNo, homeTeamApiId: matches.homeTeamApiId, guestTeamApiId: matches.guestTeamApiId, currentRemoteVersion: matches.currentRemoteVersion })
          .from(matches).where(inArray(matches.id, matchIdsToCheck))
      : Promise.resolve([]),
    allRoleIds.length > 0
      ? getDb().select({ id: refereeRoles.id, name: refereeRoles.name })
          .from(refereeRoles).where(inArray(refereeRoles.id, allRoleIds))
      : Promise.resolve([]),
  ]);

  const refNameMap = new Map(refRows.map((r) => [r.id, `${r.firstName} ${r.lastName}`.trim()]));
  const matchInfoMap = new Map(matchRows.map((m) => [m.id, {
    matchNo: m.matchNo,
    homeTeam: String(m.homeTeamApiId),
    guestTeam: String(m.guestTeamApiId),
    entityName: `Match #${m.matchNo}`,
    teamIds: [m.homeTeamApiId, m.guestTeamApiId],
    currentRemoteVersion: m.currentRemoteVersion,
  }]));
  const roleNameMap = new Map(roleRows.map((r) => [r.id, r.name]));

  for (const assignment of validAssignments) {
    const matchId = matchIdLookup.get(assignment.matchApiId)!;
    const refereeId = refereeIdLookup.get(assignment.schiedsrichterId)!;
    const roleId = roleIdLookup.get(assignment.schirirolleId)!;

    const { slotNumber } = assignment;

    try {
      const existing = existingBySlot.get(`${matchId}-${slotNumber}`) ?? null;

      if (!existing) {
        await getDb().insert(matchReferees).values({
          matchId,
          refereeId,
          roleId,
          slotNumber,
          createdAt: now,
        });
        created++;

        // Record referee assignment in match change history
        const refName = refNameMap.get(refereeId) ?? "Unknown";
        const matchInfo = matchInfoMap.get(matchId);
        const roleName = roleNameMap.get(roleId) ?? "Unknown";

        try {
          await getDb().insert(matchChanges).values({
            matchId,
            track: "remote",
            versionNumber: matchInfo?.currentRemoteVersion ?? 0,
            fieldName: `referee_slot_${slotNumber}`,
            oldValue: null,
            newValue: `${refName} (${roleName})`,
          });
        } catch (error) {
          log.warn({ err: error, matchId, refereeId }, "Failed to record referee assignment in match history");
        }

        // Emit referee.assigned event
        try {
          if (matchInfo) {
            await publishDomainEvent({
              type: EVENT_TYPES.REFEREE_ASSIGNED,
              source: "sync",
              entityType: "referee",
              entityId: matchId,
              entityName: matchInfo.entityName,
              deepLinkPath: `/admin/matches/${matchId}`,
              syncRunId: syncRunId ?? null,
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

        await getDb()
          .update(matchReferees)
          .set({ refereeId, roleId })
          .where(eq(matchReferees.id, existing.id));

        // Record reassignment in match change history and emit event
        if (oldRefereeId !== refereeId) {
          const oldRefName = refNameMap.get(oldRefereeId) ?? "Unknown";
          const newRefName = refNameMap.get(refereeId) ?? "Unknown";
          const matchInfo = matchInfoMap.get(matchId);
          const roleName = roleNameMap.get(roleId) ?? "Unknown";

          try {
            await getDb().insert(matchChanges).values({
              matchId,
              track: "remote",
              versionNumber: matchInfo?.currentRemoteVersion ?? 0,
              fieldName: `referee_slot_${slotNumber}`,
              oldValue: `${oldRefName} (${roleName})`,
              newValue: `${newRefName} (${roleName})`,
            });
          } catch (error) {
            log.warn({ err: error, matchId, refereeId }, "Failed to record referee reassignment in match history");
          }

          try {
            if (matchInfo) {
              await publishDomainEvent({
                type: EVENT_TYPES.REFEREE_REASSIGNED,
                source: "sync",
                entityType: "referee",
                entityId: matchId,
                entityName: matchInfo.entityName,
                deepLinkPath: `/admin/matches/${matchId}`,
                syncRunId: syncRunId ?? null,
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

export interface RefereeAssignmentRemovalResult {
  /** Assignments tombstoned by this pass. */
  removed: number;
  /** True when a guard refused to consider any removal at all. */
  skipped: boolean;
  /** Why the pass was skipped, for the sync log. */
  reason: string | null;
  errors: string[];
}

/**
 * Tombstone referee assignments the federation has stopped reporting (issue #105).
 *
 * Removal semantics, decided for #105:
 *  - **Soft delete.** Rows get `removed_at`; nothing is ever hard-deleted, so the
 *    history behind a `referee.unassigned` notification stays auditable and a
 *    slot can be refilled (the unique index is partial on `removed_at is null`).
 *  - **Absence only counts on a verifiably complete fetch.** Three gates in
 *    `removal-guard.ts` stand between a short response and a DELETE: per-match
 *    evidence, run-level coverage, and a mass-removal circuit breaker. A match
 *    whose game details did not come back is never a removal candidate.
 *  - **Events.** Each removal emits `referee.unassigned`, and re-advertises the
 *    slot with `referee.slots.needed` when the federation itself now flags that
 *    slot open and it is one of our club's slots.
 */
export async function removeStaleRefereeAssignments(
  leagueData: LeagueFetchedData[],
  assignments: ExtractedRefereeAssignment[],
  matchIdLookup: Map<number, number>,
  syncLogger?: SyncLogger,
  syncRunId?: number | null,
): Promise<RefereeAssignmentRemovalResult> {
  const errors: string[] = [];
  const nothingRemoved = (skipped: boolean, reason: string | null): RefereeAssignmentRemovalResult => ({
    removed: 0,
    skipped,
    reason,
    errors,
  });

  // Gate 1 + 2 — how much of this run's fetch actually landed.
  const { coverage, observedMatchApiIds } = assessGameDetailCoverage(leagueData);
  const coverageGate = evaluateFetchCoverage(coverage);
  if (!coverageGate.allowed) {
    log.warn(
      { ...coverage, reason: coverageGate.reason },
      "Skipping referee assignment removal — fetch is not verifiably complete",
    );
    await syncLogger?.log({
      entityType: "referee",
      entityId: "removal",
      action: "skipped",
      message: `Referee assignment removal skipped: ${coverageGate.reason}`,
      metadata: { ...coverage },
    });
    return nothingRemoved(true, coverageGate.reason);
  }

  // Only matches we have first-hand referee evidence for are candidates.
  const observedMatchDbIds: number[] = [];
  for (const apiMatchId of observedMatchApiIds) {
    const matchId = matchIdLookup.get(apiMatchId);
    if (matchId !== undefined) observedMatchDbIds.push(matchId);
  }
  if (observedMatchDbIds.length === 0) {
    return nothingRemoved(false, null);
  }

  const liveRows = await getDb()
    .select()
    .from(matchReferees)
    .where(and(inArray(matchReferees.matchId, observedMatchDbIds), isNull(matchReferees.removedAt)));
  if (liveRows.length === 0) {
    return nothingRemoved(false, null);
  }

  // Every slot the feed still reports as occupied, whoever occupies it. Built
  // from the *raw* extraction rather than the resolvable subset: a referee we
  // failed to resolve locally is still a referee the federation reported, and
  // must never read as "slot vacated".
  const upstreamSlots = new Set<string>();
  for (const assignment of assignments) {
    const matchId = matchIdLookup.get(assignment.matchApiId);
    if (matchId !== undefined) {
      upstreamSlots.add(`${matchId}-${assignment.slotNumber}`);
    }
  }

  const stale = liveRows.filter((row) => !upstreamSlots.has(`${row.matchId}-${row.slotNumber}`));
  if (stale.length === 0) {
    return nothingRemoved(false, null);
  }

  // Gate 3 — circuit breaker on the size of the removal set.
  const blastGate = evaluateRemovalBlastRadius(stale.length, liveRows.length);
  if (!blastGate.allowed) {
    log.error(
      { candidates: stale.length, live: liveRows.length, reason: blastGate.reason },
      "Refusing referee assignment removal — blast radius too large",
    );
    await syncLogger?.log({
      entityType: "referee",
      entityId: "removal",
      action: "skipped",
      message: `Referee assignment removal skipped: ${blastGate.reason}`,
      metadata: { candidates: stale.length, live: liveRows.length },
    });
    return nothingRemoved(true, blastGate.reason);
  }

  const context = await loadRemovalContext(stale);
  const now = new Date();
  let removed = 0;

  for (const row of stale) {
    try {
      const result = await getDb()
        .update(matchReferees)
        .set({ removedAt: now })
        .where(and(eq(matchReferees.id, row.id), isNull(matchReferees.removedAt)))
        .returning({ id: matchReferees.id });
      if (result.length === 0) continue;
      removed++;

      const refName = context.refereeNames.get(row.refereeId) ?? "Unknown";
      const roleName = context.roleNames.get(row.roleId) ?? "Unknown";
      const match = context.matches.get(row.matchId);

      try {
        await getDb().insert(matchChanges).values({
          matchId: row.matchId,
          track: "remote",
          versionNumber: match?.currentRemoteVersion ?? 0,
          fieldName: `referee_slot_${row.slotNumber}`,
          oldValue: `${refName} (${roleName})`,
          newValue: null,
        });
      } catch (error) {
        log.warn({ err: error, matchId: row.matchId }, "Failed to record referee removal in match history");
      }

      try {
        if (match) {
          await publishDomainEvent({
            type: EVENT_TYPES.REFEREE_UNASSIGNED,
            source: "sync",
            entityType: "referee",
            entityId: row.refereeId,
            entityName: refName,
            deepLinkPath: `/admin/matches/${row.matchId}`,
            syncRunId: syncRunId ?? null,
            payload: {
              matchNo: match.matchNo,
              homeTeam: match.homeTeamName,
              guestTeam: match.guestTeamName,
              refereeName: refName,
              role: roleName,
              refereeId: row.refereeId,
              matchId: row.matchId,
              kickoffDate: match.kickoffDate,
              kickoffTime: match.kickoffTime,
              teamIds: match.teamIds,
              deepLink: `/admin/matches/${row.matchId}`,
            },
          });
        }
      } catch (error) {
        log.warn({ err: error, matchId: row.matchId }, "Failed to emit referee.unassigned event");
      }

      await advertiseReopenedSlot(row.matchId, row.slotNumber, context, syncRunId);

      await syncLogger?.log({
        entityType: "referee",
        entityId: `${row.matchId}-${row.refereeId}-${row.roleId}`,
        action: "updated",
        message: `Removed referee assignment for match ${row.matchId} slot ${row.slotNumber}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Failed to remove assignment for match ${row.matchId}: ${message}`);
      await syncLogger?.log({
        entityType: "referee",
        entityId: `${row.matchId}-${row.refereeId}-${row.roleId}`,
        action: "failed",
        message: `Failed to remove assignment: ${message}`,
      });
    }
  }

  log.info({ removed, candidates: stale.length }, "Removed stale referee assignments");
  return { removed, skipped: false, reason: null, errors };
}

interface RemovalMatchInfo {
  matchNo: number;
  homeTeamName: string;
  guestTeamName: string;
  kickoffDate: string;
  kickoffTime: string;
  teamIds: number[];
  currentRemoteVersion: number | null;
  slotOpen: Record<number, boolean>;
}

interface RemovalContext {
  refereeNames: Map<number, string>;
  roleNames: Map<number, string>;
  matches: Map<number, RemovalMatchInfo>;
  refereeGames: Map<number, typeof refereeGames.$inferSelect>;
}

/** Batch-load everything the removal events need, keyed by row. */
async function loadRemovalContext(
  stale: (typeof matchReferees.$inferSelect)[],
): Promise<RemovalContext> {
  const matchIds = [...new Set(stale.map((r) => r.matchId))];
  const refereeIds = [...new Set(stale.map((r) => r.refereeId))];
  const roleIds = [...new Set(stale.map((r) => r.roleId))];

  const [refRows, roleRows, matchRows, gameRows] = await Promise.all([
    getDb()
      .select({ id: referees.id, firstName: referees.firstName, lastName: referees.lastName })
      .from(referees)
      .where(inArray(referees.id, refereeIds)),
    getDb()
      .select({ id: refereeRoles.id, name: refereeRoles.name })
      .from(refereeRoles)
      .where(inArray(refereeRoles.id, roleIds)),
    getDb()
      .select({
        id: matches.id,
        matchNo: matches.matchNo,
        kickoffDate: matches.kickoffDate,
        kickoffTime: matches.kickoffTime,
        homeTeamApiId: matches.homeTeamApiId,
        guestTeamApiId: matches.guestTeamApiId,
        currentRemoteVersion: matches.currentRemoteVersion,
        sr1Open: matches.sr1Open,
        sr2Open: matches.sr2Open,
        sr3Open: matches.sr3Open,
      })
      .from(matches)
      .where(inArray(matches.id, matchIds)),
    getDb().select().from(refereeGames).where(inArray(refereeGames.matchId, matchIds)),
  ]);

  const teamApiIds = [
    ...new Set(matchRows.flatMap((m) => [m.homeTeamApiId, m.guestTeamApiId])),
  ];
  const teamRows = teamApiIds.length > 0
    ? await getDb()
        .select({ apiTeamPermanentId: teams.apiTeamPermanentId, name: teams.name })
        .from(teams)
        .where(inArray(teams.apiTeamPermanentId, teamApiIds))
    : [];
  const teamNames = new Map(teamRows.map((t) => [t.apiTeamPermanentId, t.name]));

  return {
    refereeNames: new Map(refRows.map((r) => [r.id, `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()])),
    roleNames: new Map(roleRows.map((r) => [r.id, r.name])),
    matches: new Map(
      matchRows.map((m) => [
        m.id,
        {
          matchNo: m.matchNo,
          homeTeamName: teamNames.get(m.homeTeamApiId) ?? String(m.homeTeamApiId),
          guestTeamName: teamNames.get(m.guestTeamApiId) ?? String(m.guestTeamApiId),
          kickoffDate: m.kickoffDate,
          kickoffTime: m.kickoffTime,
          teamIds: [m.homeTeamApiId, m.guestTeamApiId],
          currentRemoteVersion: m.currentRemoteVersion,
          slotOpen: { 1: m.sr1Open, 2: m.sr2Open, 3: m.sr3Open },
        } satisfies RemovalMatchInfo,
      ]),
    ),
    refereeGames: new Map(
      gameRows.filter((g) => g.matchId !== null).map((g) => [g.matchId!, g]),
    ),
  };
}

/**
 * Put the vacated slot back on offer. Only fires when the federation itself now
 * flags the slot open and it is one of our club's slots, and reuses the
 * refereeGames entity id so it coalesces with the referee-games sync's own
 * `referee.slots.needed` for the same game instead of double-notifying.
 */
async function advertiseReopenedSlot(
  matchId: number,
  slotNumber: number,
  context: RemovalContext,
  syncRunId?: number | null,
): Promise<void> {
  if (slotNumber !== 1 && slotNumber !== 2) return;

  const match = context.matches.get(matchId);
  const game = context.refereeGames.get(matchId);
  if (!match || !game) return;
  if (!match.slotOpen[slotNumber]) return;

  const ourClub = slotNumber === 1 ? game.sr1OurClub : game.sr2OurClub;
  if (!ourClub) return;

  try {
    await publishDomainEvent({
      type: EVENT_TYPES.REFEREE_SLOTS_NEEDED,
      source: "sync",
      entityType: "referee",
      entityId: game.id,
      entityName: `${game.homeTeamName} vs ${game.guestTeamName}`,
      deepLinkPath: "/admin/referee-games",
      syncRunId: syncRunId ?? null,
      payload: {
        matchId,
        matchNo: game.matchNo,
        homeTeam: game.homeTeamName,
        guestTeam: game.guestTeamName,
        leagueId: null,
        leagueName: game.leagueName ?? "",
        kickoffDate: game.kickoffDate,
        kickoffTime: game.kickoffTime,
        venueId: null,
        venueName: game.venueName,
        sr1Open: game.sr1OurClub && match.slotOpen[1] === true,
        sr2Open: game.sr2OurClub && match.slotOpen[2] === true,
        sr1Assigned: game.sr1Status === "assigned" ? game.sr1Name : null,
        sr2Assigned: game.sr2Status === "assigned" ? game.sr2Name : null,
        deepLink: `/referee/matches?take=${matchId}`,
      },
    });
  } catch (error) {
    log.warn({ err: error, matchId, slotNumber }, "Failed to re-advertise reopened referee slot");
  }
}

export async function confirmIntentsFromSync(): Promise<number> {
  const now = new Date();

  // Single query: update all pending intents that have a matching assignment
  const result = await getDb().execute(sql`
    UPDATE ${refereeAssignmentIntents}
    SET confirmed_by_sync_at = ${now}
    WHERE ${refereeAssignmentIntents.confirmedBySyncAt} IS NULL
      AND EXISTS (
        SELECT 1 FROM ${matchReferees} mr
        WHERE mr.match_id = ${refereeAssignmentIntents}.match_id
          AND mr.referee_id = ${refereeAssignmentIntents}.referee_id
          AND mr.slot_number = ${refereeAssignmentIntents}.slot_number
          AND mr.removed_at IS NULL
      )
  `);

  return Number(result.rowCount ?? 0);
}
