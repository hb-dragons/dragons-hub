import { getDb } from "../../config/database";
import {
  matches,
  matchOverrides,
  matchRemoteVersions,
  matchChanges,
} from "@dragons/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { parseResult } from "@dragons/sdk";
import type { SdkSpielplanMatch, SdkGetGameResponse } from "@dragons/sdk";
import type { LeagueFetchedData } from "./data-fetcher";
import { computeEntityHash } from "./hash";
import type { SyncLogger } from "./sync-logger";
import type { CurrentRemoteSnapshot } from "@dragons/db/schema";
import { logger } from "../../config/logger";
import { publishDomainEvent } from "../events/event-publisher";
import type { EventType } from "@dragons/shared";
import { EVENT_TYPES } from "@dragons/shared";
import {
  extractPeriodScores,
  extractOvertimeDeltas,
  validScoreOrNull,
} from "./period-scores";
import {
  computeEffectiveChanges as computeEffectiveChangesFn,
  classifyMatchChanges,
} from "./match-change-classifier";

const log = logger.child({ service: "matches-sync" });

export interface MatchesSyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  durationMs: number;
}

interface RemoteSnapshot {
  matchNo: number;
  matchDay: number;
  kickoffDate: string;
  kickoffTime: string;
  leagueId: number | null;
  homeTeamApiId: number;
  guestTeamApiId: number;
  venueApiId: number | null;
  isConfirmed: boolean;
  isForfeited: boolean;
  isCancelled: boolean;
  homeScore: number | null;
  guestScore: number | null;
  homeHalftimeScore: number | null;
  guestHalftimeScore: number | null;
  periodFormat: "quarters" | null;
  homeQ1: number | null;
  guestQ1: number | null;
  homeQ2: number | null;
  guestQ2: number | null;
  homeQ3: number | null;
  guestQ3: number | null;
  homeQ4: number | null;
  guestQ4: number | null;
  homeOt1: number | null;
  guestOt1: number | null;
  homeOt2: number | null;
  guestOt2: number | null;
  sr1Open: boolean;
  sr2Open: boolean;
  sr3Open: boolean;
}

function buildMatchEntityName(
  basicMatch: SdkSpielplanMatch,
  leagueName?: string | null,
): string {
  const home = basicMatch.homeTeam?.teamname;
  const guest = basicMatch.guestTeam?.teamname;
  const teams = home && guest ? `${home} vs ${guest}` : null;
  const league = leagueName || basicMatch.ligaData?.liganame;
  const parts = [`#${basicMatch.matchNo}`];
  if (teams) parts.push(teams);
  if (league) parts.push(`(${league})`);
  return parts.join(" ");
}

function toRemoteSnapshot(
  basicMatch: SdkSpielplanMatch,
  details: SdkGetGameResponse | null,
  leagueId: number | null,
): RemoteSnapshot {
  const game = details?.game1;
  const parsedResult = parseResult(basicMatch.result);

  const homeScore = validScoreOrNull(game?.heimEndstand) ?? parsedResult.home;
  const guestScore = validScoreOrNull(game?.gastEndstand) ?? parsedResult.guest;

  const periodScores = extractPeriodScores(game);
  const overtimeDeltas = extractOvertimeDeltas(game, periodScores);

  return {
    matchNo: basicMatch.matchNo,
    matchDay: basicMatch.matchDay || 0,
    kickoffDate: basicMatch.kickoffDate,
    kickoffTime: basicMatch.kickoffTime,
    leagueId,
    homeTeamApiId: basicMatch.homeTeam!.teamPermanentId,
    guestTeamApiId: basicMatch.guestTeam!.teamPermanentId,
    venueApiId: game?.spielfeldId ?? null,
    isConfirmed: basicMatch.ergebnisbestaetigt,
    isForfeited: basicMatch.verzicht,
    isCancelled: basicMatch.abgesagt,
    homeScore,
    guestScore,
    homeHalftimeScore: validScoreOrNull(game?.heimHalbzeitstand),
    guestHalftimeScore: validScoreOrNull(game?.gastHalbzeitstand),
    ...periodScores,
    ...overtimeDeltas,
    sr1Open: details?.sr1?.offenAngeboten ?? false,
    sr2Open: details?.sr2?.offenAngeboten ?? false,
    sr3Open: details?.sr3?.offenAngeboten ?? false,
  };
}

function snapshotToHashData(snapshot: RemoteSnapshot): Record<string, unknown> {
  return {
    matchNo: snapshot.matchNo,
    matchDay: snapshot.matchDay,
    kickoffDate: snapshot.kickoffDate,
    kickoffTime: snapshot.kickoffTime,
    homeTeamApiId: snapshot.homeTeamApiId,
    guestTeamApiId: snapshot.guestTeamApiId,
    isConfirmed: snapshot.isConfirmed,
    isForfeited: snapshot.isForfeited,
    isCancelled: snapshot.isCancelled,
    homeScore: snapshot.homeScore,
    guestScore: snapshot.guestScore,
    homeHalftimeScore: snapshot.homeHalftimeScore,
    guestHalftimeScore: snapshot.guestHalftimeScore,
    periodFormat: snapshot.periodFormat,
    homeQ1: snapshot.homeQ1,
    guestQ1: snapshot.guestQ1,
    homeQ2: snapshot.homeQ2,
    guestQ2: snapshot.guestQ2,
    homeQ3: snapshot.homeQ3,
    guestQ3: snapshot.guestQ3,
    homeQ4: snapshot.homeQ4,
    guestQ4: snapshot.guestQ4,
    homeOt1: snapshot.homeOt1,
    guestOt1: snapshot.guestOt1,
    homeOt2: snapshot.homeOt2,
    guestOt2: snapshot.guestOt2,
    sr1Open: snapshot.sr1Open,
    sr2Open: snapshot.sr2Open,
    sr3Open: snapshot.sr3Open,
  };
}

/**
 * Detail-sourced fields that `toRemoteSnapshot` can only populate from game
 * details. When the detail fetch fails they arrive at their "missing" default
 * (null for the scores, `false` for the sr*Open flags) even though the real
 * values are still persisted, so both the hash and the persisted row must fall
 * back to the existing values. Single source of truth for `resolveSnapshotForHash`
 * and the preservation block in the update path. (issue #49)
 */
const PRESERVED_DETAIL_FIELDS = [
  "homeHalftimeScore",
  "guestHalftimeScore",
  "periodFormat",
  "homeQ1",
  "guestQ1",
  "homeQ2",
  "guestQ2",
  "homeQ3",
  "guestQ3",
  "homeQ4",
  "guestQ4",
  "homeOt1",
  "guestOt1",
  "homeOt2",
  "guestOt2",
  "sr1Open",
  "sr2Open",
  "sr3Open",
] as const;

/**
 * Build the snapshot used for hashing and version snapshots. When game details
 * are unavailable, refill the detail-sourced fields from the already-persisted
 * row so the hash reflects what is actually stored. Without this the hash flips
 * on every detail-fetch failure, defeating the O(1) skip and churning the
 * version history with all-null snapshots. (issue #49)
 */
function resolveSnapshotForHash(
  snapshot: RemoteSnapshot,
  details: SdkGetGameResponse | null,
  existing: typeof matches.$inferSelect | null,
): RemoteSnapshot {
  // With details the snapshot is authoritative. Without them every detail field
  // is a "missing" default, so fall back to the persisted row for all of them.
  if (details || !existing) return snapshot;
  const resolved: RemoteSnapshot = { ...snapshot };
  for (const field of PRESERVED_DETAIL_FIELDS) {
    resolved[field] = existing[field] as never;
  }
  return resolved;
}

function computeEffectiveChanges(
  locked: typeof matches.$inferSelect,
  updateSet: Record<string, unknown>,
) {
  return computeEffectiveChangesFn(
    locked as unknown as Record<string, FieldValueShape>,
    updateSet,
    SNAPSHOT_DB_FIELDS as unknown as readonly string[],
  );
}

type FieldValueShape = string | number | boolean | null | undefined;

const SNAPSHOT_DB_FIELDS = [
  "matchNo",
  "matchDay",
  "kickoffDate",
  "kickoffTime",
  "isConfirmed",
  "isForfeited",
  "isCancelled",
  "homeScore",
  "guestScore",
  "homeHalftimeScore",
  "guestHalftimeScore",
  "periodFormat",
  "homeQ1",
  "guestQ1",
  "homeQ2",
  "guestQ2",
  "homeQ3",
  "guestQ3",
  "homeQ4",
  "guestQ4",
  "homeOt1",
  "guestOt1",
  "homeOt2",
  "guestOt2",
  "sr1Open",
  "sr2Open",
  "sr3Open",
] as const;


export { buildMatchEntityName };

export async function syncMatchesFromData(
  leagueData: LeagueFetchedData[],
  venueIdLookup: Map<number, number>,
  syncRunId: number | null,
  logger?: SyncLogger,
): Promise<MatchesSyncResult> {
  const startedAt = Date.now();
  const result: MatchesSyncResult = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  };

  // Batch-load all existing matches to avoid N+1 SELECTs
  const allApiMatchIds = leagueData
    .flatMap((d) => d.spielplan.map((m) => m.matchId))
    .filter((id): id is number => typeof id === "number" && id > 0);

  const existingMatchesByApiId = new Map<number, typeof matches.$inferSelect>();
  if (allApiMatchIds.length > 0) {
    const existingMatches = await getDb()
      .select()
      .from(matches)
      .where(inArray(matches.apiMatchId, allApiMatchIds));
    for (const m of existingMatches) {
      existingMatchesByApiId.set(m.apiMatchId, m);
    }
  }

  for (const data of leagueData) {
    if (!data.leagueDbId) {
      result.errors.push(`No DB ID for league API ID ${data.leagueApiId}`);
      continue;
    }

    log.info(
      { leagueApiId: data.leagueApiId, count: data.spielplan.length },
      "Processing matches for league",
    );

    for (const basicMatch of data.spielplan) {
      const apiMatchId = basicMatch.matchId;
      if (!apiMatchId) {
        result.errors.push(
          `Match without matchId in league ${data.leagueApiId}`,
        );
        continue;
      }

      result.total++;
      const entityName = buildMatchEntityName(basicMatch, data.leagueName);

      try {

        if (!basicMatch.homeTeam || !basicMatch.guestTeam) {
          result.skipped++;
          await logger?.log({
            entityType: "match",
            entityId: String(apiMatchId),
            entityName,
            action: "skipped",
            message: "Missing home or guest team",
          });
          continue;
        }

        const details = data.gameDetails.get(apiMatchId) ?? null;
        const remoteSnapshot = toRemoteSnapshot(
          basicMatch,
          details,
          data.leagueDbId,
        );
        const existing = existingMatchesByApiId.get(apiMatchId) ?? null;

        // Hash (and snapshot) the values we will actually persist: when details
        // are unavailable the detail fields are refilled from the existing row so
        // an availability flip doesn't thrash the hash. (issue #49)
        const hashSnapshot = resolveSnapshotForHash(
          remoteSnapshot,
          details,
          existing,
        );
        const newHash = computeEntityHash(snapshotToHashData(hashSnapshot));

        const apiVenueId = remoteSnapshot.venueApiId;
        const internalVenueId = apiVenueId
          ? (venueIdLookup.get(apiVenueId) ?? null)
          : null;

        if (existing) {
          // Hash-based skip: O(1) comparison
          if (existing.remoteDataHash === newHash) {
            result.skipped++;
            await logger?.log({
              entityType: "match",
              entityId: String(apiMatchId),
              entityName,
              action: "skipped",
              message: "No changes detected",
            });
            continue;
          }

          // Data changed — lock row and create version snapshot + field changes in transaction
          const effectiveChanges = await getDb().transaction(async (tx) => {
            // Re-read with FOR UPDATE to prevent concurrent version increments
            const [locked] = await tx
              .select()
              .from(matches)
              .where(eq(matches.id, existing.id))
              .for("update");

            if (!locked) return [];

            // Load active overrides for this match
            const overrides = await tx
              .select({ fieldName: matchOverrides.fieldName })
              .from(matchOverrides)
              .where(eq(matchOverrides.matchId, locked.id));
            const overriddenSet = new Set(overrides.map((o) => o.fieldName));

            // Build update set, skipping overridden fields
            const updateSet: Record<string, unknown> = {};
            for (const field of SNAPSHOT_DB_FIELDS) {
              if (!overriddenSet.has(field)) {
                updateSet[field] = remoteSnapshot[field];
              }
            }

            // Handle special fields not in SNAPSHOT_DB_FIELDS
            updateSet.leagueId = remoteSnapshot.leagueId;
            updateSet.venueId = details
              ? internalVenueId
              : (internalVenueId ?? locked.venueId);

            // When game details are unavailable, preserve every detail-sourced
            // field (scores arrive null, sr*Open flags arrive false) from the
            // persisted row so a detail-fetch failure neither regresses data nor
            // churns the version/audit history. Overridden fields keep their local
            // value and were already left out of the update set above. (issue #49)
            if (!details) {
              for (const field of PRESERVED_DETAIL_FIELDS) {
                if (!overriddenSet.has(field)) {
                  updateSet[field] = locked[field];
                }
              }
            }

            // Compute effective changes (what actually changes in DB)
            const effective = computeEffectiveChanges(locked, updateSet);

            // Venue change (venueId not in SNAPSHOT_DB_FIELDS, checked separately)
            if (String(locked.venueId ?? "") !== String(updateSet.venueId ?? "")) {
              effective.push({
                fieldName: "venueId",
                oldValue: locked.venueId != null ? String(locked.venueId) : null,
                newValue: updateSet.venueId != null ? String(updateSet.venueId as number) : null,
              });
            }

            // Only snapshot a new remote version, bump currentRemoteVersion, and
            // write audit rows when something is actually persisted. A detail-fetch
            // failure leaves the snapshot's detail fields null, but the preservation
            // block above keeps the stored values, so `effective` is empty — we must
            // not churn the version history or write "X -> null" audit rows. Audit
            // rows derive from `effective` (the real persisted diff), never the raw
            // snapshot. (issue #49)
            const newVersionNumber =
              effective.length > 0
                ? locked.currentRemoteVersion + 1
                : locked.currentRemoteVersion;

            if (effective.length > 0) {
              await tx.insert(matchRemoteVersions).values({
                matchId: locked.id,
                versionNumber: newVersionNumber,
                syncRunId,
                snapshot: hashSnapshot as unknown as CurrentRemoteSnapshot,
                dataHash: newHash,
              });

              await tx.insert(matchChanges).values(
                effective.map((change) => ({
                  matchId: locked.id,
                  track: "remote" as const,
                  versionNumber: newVersionNumber,
                  fieldName: change.fieldName,
                  oldValue: change.oldValue,
                  newValue: change.newValue,
                })),
              );
            }

            // Auto-release or conflict: check each overridden field
            for (const fieldName of overriddenSet) {
              const remoteVal = String(
                remoteSnapshot[fieldName as keyof RemoteSnapshot] ?? "",
              );
              const lockedVal = String(
                locked[fieldName as keyof typeof locked] ?? "",
              );
              if (remoteVal === lockedVal) {
                // Remote now matches local override — auto-release
                await tx
                  .delete(matchOverrides)
                  .where(
                    and(
                      eq(matchOverrides.matchId, locked.id),
                      eq(matchOverrides.fieldName, fieldName),
                    ),
                  );
              } else {
                try {
                  await publishDomainEvent(
                    {
                      type: EVENT_TYPES.OVERRIDE_CONFLICT,
                      source: "sync",
                      entityType: "match",
                      entityId: existing.id,
                      entityName,
                      deepLinkPath: `/admin/matches/${existing.id}`,
                      payload: {
                        matchNo: basicMatch.matchNo,
                        homeTeam: basicMatch.homeTeam?.teamname ?? "Unknown",
                        guestTeam: basicMatch.guestTeam?.teamname ?? "Unknown",
                        fieldName,
                        localValue: lockedVal,
                        newRemoteValue: remoteVal,
                      },
                      syncRunId,
                    },
                    tx,
                  );
                } catch (error) {
                  log.warn({ err: error, matchId: existing.id, fieldName }, "Failed to emit override.conflict event");
                }
              }
            }

            // Update match record
            await tx
              .update(matches)
              .set({
                ...updateSet,
                currentRemoteVersion: newVersionNumber,
                remoteDataHash: newHash,
                lastRemoteSync: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(matches.id, locked.id));

            // Publish match.* events INSIDE the transaction. The old order
            // published after the tx committed, so a crash between commit and the
            // event insert permanently lost these high-urgency events (there was
            // no outbox row to recover). Passing tx inserts them atomically with
            // the match write; the 30s outbox poller enqueues them after commit.
            if (effective.length > 0) {
              const homeTeamName = basicMatch.homeTeam?.teamname ?? "Unknown";
              const guestTeamName = basicMatch.guestTeam?.teamname ?? "Unknown";
              const leagueName = data.leagueName ?? "";
              const teamIds = [remoteSnapshot.homeTeamApiId, remoteSnapshot.guestTeamApiId];
              const matchEventTypes = classifyMatchChanges(effective);

              for (const eventType of matchEventTypes) {
                try {
                  const eventPayload: Record<string, unknown> = {
                    matchNo: basicMatch.matchNo,
                    homeTeam: homeTeamName,
                    guestTeam: guestTeamName,
                    leagueName,
                    leagueId: data.leagueDbId,
                    teamIds,
                  };

                  if (eventType === EVENT_TYPES.MATCH_SCHEDULE_CHANGED) {
                    eventPayload.changes = effective
                      .filter((c) => c.fieldName === "kickoffDate" || c.fieldName === "kickoffTime")
                      .map((c) => ({ field: c.fieldName, oldValue: c.oldValue, newValue: c.newValue }));
                  } else if (eventType === EVENT_TYPES.MATCH_VENUE_CHANGED) {
                    const venueChange = effective.find((c) => c.fieldName === "venueId");
                    eventPayload.oldVenueId = venueChange?.oldValue ? Number(venueChange.oldValue) : null;
                    eventPayload.oldVenueName = null;
                    eventPayload.newVenueId = venueChange?.newValue ? Number(venueChange.newValue) : null;
                    eventPayload.newVenueName = null;
                  } else if (eventType === EVENT_TYPES.MATCH_RESULT_ENTERED) {
                    const homeScoreChange = effective.find((c) => c.fieldName === "homeScore");
                    const guestScoreChange = effective.find((c) => c.fieldName === "guestScore");
                    eventPayload.homeScore = homeScoreChange?.newValue ? Number(homeScoreChange.newValue) : 0;
                    eventPayload.guestScore = guestScoreChange?.newValue ? Number(guestScoreChange.newValue) : 0;
                  } else if (eventType === EVENT_TYPES.MATCH_RESULT_CHANGED) {
                    const homeScoreChange = effective.find((c) => c.fieldName === "homeScore");
                    const guestScoreChange = effective.find((c) => c.fieldName === "guestScore");
                    eventPayload.oldHomeScore = homeScoreChange?.oldValue ? Number(homeScoreChange.oldValue) : 0;
                    eventPayload.oldGuestScore = guestScoreChange?.oldValue ? Number(guestScoreChange.oldValue) : 0;
                    eventPayload.newHomeScore = homeScoreChange?.newValue ? Number(homeScoreChange.newValue) : 0;
                    eventPayload.newGuestScore = guestScoreChange?.newValue ? Number(guestScoreChange.newValue) : 0;
                  } else if (eventType === EVENT_TYPES.MATCH_CONFIRMED) {
                    const homeScoreChange = effective.find((c) => c.fieldName === "homeScore");
                    const guestScoreChange = effective.find((c) => c.fieldName === "guestScore");
                    eventPayload.homeScore = homeScoreChange?.newValue ? Number(homeScoreChange.newValue) : (remoteSnapshot.homeScore ?? null);
                    eventPayload.guestScore = guestScoreChange?.newValue ? Number(guestScoreChange.newValue) : (remoteSnapshot.guestScore ?? null);
                  }

                  await publishDomainEvent(
                    {
                      type: eventType as EventType,
                      source: "sync",
                      entityType: "match",
                      entityId: existing.id,
                      entityName,
                      deepLinkPath: `/admin/matches/${existing.id}`,
                      payload: eventPayload,
                      syncRunId,
                    },
                    tx,
                  );
                } catch (error) {
                  log.warn({ err: error, eventType, matchId: existing.id }, "Failed to emit match event");
                }
              }
            }

            return effective;
          });

          if (effectiveChanges.length > 0) {
            result.updated++;
            await logger?.log({
              entityType: "match",
              entityId: String(apiMatchId),
              entityName,
              action: "updated",
              message: `Updated match ${apiMatchId}`,
            });
          } else {
            result.skipped++;
            await logger?.log({
              entityType: "match",
              entityId: String(apiMatchId),
              entityName,
              action: "skipped",
              message: "Hash updated, no effective data changes",
            });
          }
        } else {
          // Create new match — insert, version snapshot, and the match.created
          // event in ONE transaction so a crash between the row write and the
          // event insert can't lose the event (the old order ran all three
          // outside any transaction). Passing tx inserts the event atomically
          // with the match; the 30s outbox poller enqueues it after commit.
          await getDb().transaction(async (tx) => {
            const [newMatch] = await tx
              .insert(matches)
              .values({
                apiMatchId,
                matchNo: remoteSnapshot.matchNo,
                matchDay: remoteSnapshot.matchDay,
                kickoffDate: remoteSnapshot.kickoffDate,
                kickoffTime: remoteSnapshot.kickoffTime,
                leagueId: remoteSnapshot.leagueId,
                homeTeamApiId: remoteSnapshot.homeTeamApiId,
                guestTeamApiId: remoteSnapshot.guestTeamApiId,
                venueId: internalVenueId,
                isConfirmed: remoteSnapshot.isConfirmed,
                isForfeited: remoteSnapshot.isForfeited,
                isCancelled: remoteSnapshot.isCancelled,
                homeScore: remoteSnapshot.homeScore,
                guestScore: remoteSnapshot.guestScore,
                homeHalftimeScore: remoteSnapshot.homeHalftimeScore,
                guestHalftimeScore: remoteSnapshot.guestHalftimeScore,
                periodFormat: remoteSnapshot.periodFormat,
                homeQ1: remoteSnapshot.homeQ1,
                guestQ1: remoteSnapshot.guestQ1,
                homeQ2: remoteSnapshot.homeQ2,
                guestQ2: remoteSnapshot.guestQ2,
                homeQ3: remoteSnapshot.homeQ3,
                guestQ3: remoteSnapshot.guestQ3,
                homeQ4: remoteSnapshot.homeQ4,
                guestQ4: remoteSnapshot.guestQ4,
                homeOt1: remoteSnapshot.homeOt1,
                guestOt1: remoteSnapshot.guestOt1,
                homeOt2: remoteSnapshot.homeOt2,
                guestOt2: remoteSnapshot.guestOt2,
                sr1Open: remoteSnapshot.sr1Open,
                sr2Open: remoteSnapshot.sr2Open,
                sr3Open: remoteSnapshot.sr3Open,
                currentRemoteVersion: 1,
                currentLocalVersion: 0,
                remoteDataHash: newHash,
                lastRemoteSync: new Date(),
              })
              .returning();

            if (newMatch) {
              await tx.insert(matchRemoteVersions).values({
                matchId: newMatch.id,
                versionNumber: 1,
                syncRunId,
                snapshot: remoteSnapshot as unknown as CurrentRemoteSnapshot,
                dataHash: newHash,
              });

              // Emit match.created event for new match
              try {
                await publishDomainEvent(
                  {
                    type: EVENT_TYPES.MATCH_CREATED,
                    source: "sync",
                    entityType: "match",
                    entityId: newMatch.id,
                    entityName,
                    deepLinkPath: `/admin/matches/${newMatch.id}`,
                    payload: {
                      matchNo: basicMatch.matchNo,
                      homeTeam: basicMatch.homeTeam?.teamname ?? "Unknown",
                      guestTeam: basicMatch.guestTeam?.teamname ?? "Unknown",
                      leagueId: data.leagueDbId,
                      leagueName: data.leagueName ?? "",
                      kickoffDate: remoteSnapshot.kickoffDate,
                      kickoffTime: remoteSnapshot.kickoffTime,
                      venueId: internalVenueId,
                      venueName: null,
                      teamIds: [remoteSnapshot.homeTeamApiId, remoteSnapshot.guestTeamApiId],
                    },
                    syncRunId,
                  },
                  tx,
                );
              } catch (error) {
                log.warn({ err: error, matchId: newMatch.id }, "Failed to emit match.created event");
              }
            }
          });

          result.created++;

          await logger?.log({
            entityType: "match",
            entityId: String(apiMatchId),
            entityName,
            action: "created",
            message: `Created match ${apiMatchId}`,
          });
        }
      } catch (error) {
        result.failed++;
        const message =
          error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Failed to sync match ${apiMatchId}: ${message}`);
        await logger?.log({
          entityType: "match",
          entityId: String(apiMatchId),
          entityName,
          action: "failed",
          message: `Failed to sync match: ${message}`,
        });
      }
    }
  }

  result.durationMs = Date.now() - startedAt;
  log.info(
    { durationMs: result.durationMs, created: result.created, updated: result.updated, skipped: result.skipped, errors: result.errors.length },
    "Matches sync completed",
  );

  return result;
}
