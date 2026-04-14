import { db } from "../../config/database";
import { syncRuns } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { syncLeagues } from "./leagues.sync";
import { syncTeamsFromData } from "./teams.sync";
import { syncMatchesFromData } from "./matches.sync";
import { syncStandingsFromData } from "./standings.sync";
import { syncVenuesFromData, buildVenueIdLookup } from "./venues.sync";
import {
  syncRefereesFromData,
  syncRefereeRolesFromData,
  syncRefereeAssignmentsFromData,
  buildMatchIdLookup,
  confirmIntentsFromSync,
} from "./referees.sync";
import { createSyncLogger } from "./sync-logger";
import { fetchAllSyncData, extractRefereeAssignments } from "./data-fetcher";
import { reconcileAfterSync } from "../venue-booking/venue-booking.service";
import { logger } from "../../config/logger";
import { publishDomainEvent } from "../events/event-publisher";
import { EVENT_TYPES } from "@dragons/shared";

const log = logger.child({ service: "sync" });

export interface SyncResult {
  syncRunId: number;
  triggeredBy: "cron" | "manual";
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  leagues: { created: number; updated: number; skipped: number; errors: number };
  teams: { created: number; updated: number; skipped: number; errors: number };
  matches: { created: number; updated: number; skipped: number; errors: number };
  standings: { created: number; updated: number; skipped: number; errors: number };
  venues: { created: number; updated: number; skipped: number; errors: number };
  referees: {
    created: number;
    updated: number;
    skipped: number;
    rolesCreated: number;
    rolesUpdated: number;
    rolesSkipped: number;
    assignmentsCreated: number;
    errors: number;
  };
  totalErrors: string[];
  status: "completed" | "failed";
}

export async function fullSync(
  triggeredBy: "cron" | "manual",
  jobLogger?: (msg: string) => Promise<void> | void,
  syncRunId?: number,
): Promise<SyncResult> {
  const logStep = async (msg: string) => {
    log.info(msg);
    if (jobLogger) await jobLogger(msg);
  };

  const startedAt = new Date();
  const allErrors: string[] = [];

  // Reuse existing sync run (from eager creation) or create a new one
  let syncRun: { id: number };
  if (syncRunId) {
    const [updated] = await db
      .update(syncRuns)
      .set({ status: "running", startedAt })
      .where(eq(syncRuns.id, syncRunId))
      .returning();
    if (!updated) {
      throw new Error("Failed to update sync run");
    }
    syncRun = updated;
  } else {
    const [created] = await db
      .insert(syncRuns)
      .values({
        syncType: "full",
        triggeredBy,
        status: "running",
        startedAt,
      })
      .returning();
    if (!created) {
      throw new Error("Failed to create sync run");
    }
    syncRun = created;
  }

  // Create sync logger for per-item logging
  const syncLogger = createSyncLogger(syncRun.id);

  try {
    await logStep(`Starting full sync (triggered by: ${triggeredBy})`);

    // Step 1: Sync leagues (sequential — FK dependency)
    await logStep("Step 1/6: Syncing leagues...");
    const leaguesResult = await syncLeagues(syncLogger);
    allErrors.push(...leaguesResult.errors);

    // Step 2: Parallel data fetch from SDK
    await logStep("Step 2/6: Fetching all data in parallel...");
    const syncData = await fetchAllSyncData();
    await logStep(
      `Fetched: ${syncData.leagueData.length} leagues, ${syncData.teams.size} teams, ${syncData.venues.size} venues, ${syncData.referees.size} referees`,
    );

    // Step 3: Parallel entity upserts (independent tables)
    await logStep("Step 3/6: Syncing entities in parallel...");
    const [teamsRes, venuesRes, refereesRes, rolesRes, standingsRes] = await Promise.all([
      syncTeamsFromData(syncData.teams, syncLogger),
      syncVenuesFromData(syncData.venues, syncLogger),
      syncRefereesFromData(syncData.referees, syncLogger),
      syncRefereeRolesFromData(syncData.refereeRoles, syncLogger),
      syncStandingsFromData(syncData.leagueData, syncLogger),
    ]);

    allErrors.push(...teamsRes.errors);
    allErrors.push(...venuesRes.errors);
    allErrors.push(...refereesRes.errors);
    allErrors.push(...standingsRes.errors);

    // Step 4: Matches sync (needs venue FK lookup)
    await logStep("Step 4/6: Syncing matches...");
    const venueIdLookup = await buildVenueIdLookup();
    const matchesRes = await syncMatchesFromData(
      syncData.leagueData,
      venueIdLookup,
      syncRun.id,
      syncLogger,
    );
    allErrors.push(...matchesRes.errors);

    // Step 5: Referee assignments (needs match + referee FK lookups)
    await logStep("Step 5/6: Syncing referee assignments...");
    const refereeAssignments = extractRefereeAssignments(syncData.leagueData);
    const matchIdLookup = await buildMatchIdLookup();
    const assignmentsRes = await syncRefereeAssignmentsFromData(
      refereeAssignments,
      refereesRes.refereeIdLookup,
      rolesRes.roleIdLookup,
      matchIdLookup,
      syncLogger,
      syncRun.id,
    );
    allErrors.push(...assignmentsRes.errors);

    // Step 5.25: Confirm referee assignment intents
    await logStep("Confirming referee assignment intents...");
    const confirmedIntents = await confirmIntentsFromSync();
    if (confirmedIntents > 0) {
      await logStep(`Confirmed ${confirmedIntents} referee assignment intents`);
    }

    // Step 5.5: Reconcile venue bookings
    await logStep("Reconciling venue bookings...");
    try {
      await reconcileAfterSync();
      await logStep("Venue bookings reconciled");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      allErrors.push(`Venue booking reconciliation failed: ${message}`);
      log.error({ err: error }, "Venue booking reconciliation failed");
    }

    // Step 6: Finalize
    await logStep("Step 6/6: Finalizing...");

    // Close sync logger (flushes remaining entries)
    await syncLogger.close();

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    const summary = {
      leagues: {
        total: leaguesResult.total,
        created: leaguesResult.created,
        updated: leaguesResult.updated,
        skipped: leaguesResult.skipped,
      },
      teams: { total: teamsRes.total, created: teamsRes.created, updated: teamsRes.updated, skipped: teamsRes.skipped },
      matches: {
        total: matchesRes.total,
        created: matchesRes.created,
        updated: matchesRes.updated,
        skipped: matchesRes.skipped,
      },
      standings: { total: standingsRes.total, created: standingsRes.created, updated: standingsRes.updated, skipped: standingsRes.skipped },
      venues: { total: venuesRes.total, created: venuesRes.created, updated: venuesRes.updated, skipped: venuesRes.skipped },
      referees: {
        created: refereesRes.created,
        updated: refereesRes.updated,
        skipped: refereesRes.skipped,
        rolesCreated: rolesRes.created,
        rolesUpdated: rolesRes.updated,
        rolesSkipped: rolesRes.skipped,
        assignmentsCreated: assignmentsRes.created,
      },
    };

    const [updatedRun] = await db
      .update(syncRuns)
      .set({
        status: "completed",
        completedAt,
        durationMs,
        recordsProcessed:
          leaguesResult.total + teamsRes.total + matchesRes.total + standingsRes.total + venuesRes.total
          + (refereesRes.created + refereesRes.updated + refereesRes.skipped)
          + (rolesRes.created + rolesRes.updated + rolesRes.skipped)
          + assignmentsRes.created,
        recordsCreated:
          leaguesResult.created + teamsRes.created + matchesRes.created + standingsRes.created + venuesRes.created
          + refereesRes.created + rolesRes.created + assignmentsRes.created,
        recordsUpdated:
          leaguesResult.updated + teamsRes.updated + matchesRes.updated + standingsRes.updated + venuesRes.updated
          + refereesRes.updated + rolesRes.updated,
        recordsSkipped:
          leaguesResult.skipped + teamsRes.skipped + matchesRes.skipped + standingsRes.skipped + venuesRes.skipped
          + refereesRes.skipped + rolesRes.skipped,
        recordsFailed: allErrors.length,
        errorMessage: allErrors.length > 0 ? allErrors.slice(0, 10).join("\n") : null,
        summary,
      })
      .where(eq(syncRuns.id, syncRun.id))
      .returning({ id: syncRuns.id });

    if (!updatedRun) {
      log.warn({ syncRunId: syncRun.id }, "Completion update did not match any rows");
    }

    const syncResult: SyncResult = {
      syncRunId: syncRun.id,
      triggeredBy,
      startedAt,
      completedAt,
      durationMs,
      leagues: {
        created: leaguesResult.created,
        updated: leaguesResult.updated,
        skipped: leaguesResult.skipped,
        errors: leaguesResult.errors.length,
      },
      teams: { created: teamsRes.created, updated: teamsRes.updated, skipped: teamsRes.skipped, errors: teamsRes.errors.length },
      matches: {
        created: matchesRes.created,
        updated: matchesRes.updated,
        skipped: matchesRes.skipped,
        errors: matchesRes.errors.length,
      },
      standings: { created: standingsRes.created, updated: standingsRes.updated, skipped: standingsRes.skipped, errors: standingsRes.errors.length },
      venues: { created: venuesRes.created, updated: venuesRes.updated, skipped: venuesRes.skipped, errors: venuesRes.errors.length },
      referees: {
        created: refereesRes.created,
        updated: refereesRes.updated,
        skipped: refereesRes.skipped,
        rolesCreated: rolesRes.created,
        rolesUpdated: rolesRes.updated,
        rolesSkipped: rolesRes.skipped,
        assignmentsCreated: assignmentsRes.created,
        errors: refereesRes.errors.length + assignmentsRes.errors.length,
      },
      totalErrors: allErrors,
      status: "completed",
    };

    // Emit sync.completed domain event
    try {
      const totalProcessed =
        leaguesResult.total + teamsRes.total + matchesRes.total + standingsRes.total + venuesRes.total
        + (refereesRes.created + refereesRes.updated + refereesRes.skipped)
        + (rolesRes.created + rolesRes.updated + rolesRes.skipped)
        + assignmentsRes.created;
      const totalCreated =
        leaguesResult.created + teamsRes.created + matchesRes.created + standingsRes.created + venuesRes.created
        + refereesRes.created + rolesRes.created + assignmentsRes.created;
      const totalUpdated =
        leaguesResult.updated + teamsRes.updated + matchesRes.updated + standingsRes.updated + venuesRes.updated
        + refereesRes.updated + rolesRes.updated;

      await publishDomainEvent({
        type: EVENT_TYPES.SYNC_COMPLETED,
        source: "sync",
        entityType: "match",
        entityId: 0,
        entityName: "Sync Run",
        deepLinkPath: `/admin/sync/logs/${syncRun.id}`,
        payload: {
          syncRunId: syncRun.id,
          syncType: "full",
          durationMs,
          recordsProcessed: totalProcessed,
          recordsCreated: totalCreated,
          recordsUpdated: totalUpdated,
          recordsFailed: allErrors.length,
          eventsEmitted: 0,
        },
        syncRunId: syncRun.id,
      });
    } catch (error) {
      log.warn({ err: error }, "Failed to emit sync.completed event");
    }

    await logStep(`Full sync completed in ${durationMs}ms with ${allErrors.length} errors`);
    return syncResult;
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : "Unknown error";
    allErrors.push(`Fatal sync error: ${message}`);

    await syncLogger.close();

    await db
      .update(syncRuns)
      .set({
        status: "failed",
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        recordsFailed: allErrors.length,
        errorMessage: message,
        errorStack: error instanceof Error ? error.stack : undefined,
      })
      .where(eq(syncRuns.id, syncRun.id));

    log.error({ err: error }, `Full sync failed: ${message}`);

    return {
      syncRunId: syncRun.id,
      triggeredBy,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      leagues: { created: 0, updated: 0, skipped: 0, errors: 0 },
      teams: { created: 0, updated: 0, skipped: 0, errors: 0 },
      matches: { created: 0, updated: 0, skipped: 0, errors: 0 },
      standings: { created: 0, updated: 0, skipped: 0, errors: 0 },
      venues: { created: 0, updated: 0, skipped: 0, errors: 0 },
      referees: { created: 0, updated: 0, skipped: 0, rolesCreated: 0, rolesUpdated: 0, rolesSkipped: 0, assignmentsCreated: 0, errors: 0 },
      totalErrors: allErrors,
      status: "failed",
    };
  }
}
