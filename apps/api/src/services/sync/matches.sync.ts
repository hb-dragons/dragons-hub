import { db } from "../../config/database";
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
import { EVENT_TYPES } from "@dragons/shared";
import {
  extractPeriodScores,
  extractOvertimeDeltas,
  validScoreOrNull,
} from "./period-scores";
import {
  detectFieldChanges as detectFieldChangesFn,
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

/** Fields tracked for remote change detection */
const TRACKED_FIELDS = [
  "matchNo",
  "matchDay",
  "kickoffDate",
  "kickoffTime",
  "homeTeamApiId",
  "guestTeamApiId",
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

function detectFieldChanges(
  existing: typeof matches.$inferSelect,
  snapshot: RemoteSnapshot,
) {
  return detectFieldChangesFn(
    existing as unknown as Record<string, FieldValueShape>,
    snapshot as unknown as Record<string, FieldValueShape>,
    TRACKED_FIELDS as unknown as readonly string[],
  );
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
    const existingMatches = await db
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
        const newHash = computeEntityHash(snapshotToHashData(remoteSnapshot));

        const existing = existingMatchesByApiId.get(apiMatchId) ?? null;

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
          const effectiveChanges = await db.transaction(async (tx) => {
            // Re-read with FOR UPDATE to prevent concurrent version increments
            const [locked] = await tx
              .select()
              .from(matches)
              .where(eq(matches.id, existing.id))
              .for("update");

            if (!locked) return [];

            const newVersionNumber = locked.currentRemoteVersion + 1;
            const fieldChanges = detectFieldChanges(locked, remoteSnapshot);

            // Venue change detection (venueApiId in snapshot → venueId in DB, not in TRACKED_FIELDS)
            const resolvedVenueId = details
              ? internalVenueId
              : (internalVenueId ?? locked.venueId);
            if (String(locked.venueId ?? "") !== String(resolvedVenueId ?? "")) {
              fieldChanges.push({
                fieldName: "venueId",
                oldValue: locked.venueId != null ? String(locked.venueId) : null,
                newValue: resolvedVenueId != null ? String(resolvedVenueId) : null,
              });
            }

            // Create version snapshot
            await tx.insert(matchRemoteVersions).values({
              matchId: locked.id,
              versionNumber: newVersionNumber,
              syncRunId,
              snapshot: remoteSnapshot as unknown as CurrentRemoteSnapshot,
              dataHash: newHash,
            });

            // Create field-level changes (audit trail)
            if (fieldChanges.length > 0) {
              await tx.insert(matchChanges).values(
                fieldChanges.map((change) => ({
                  matchId: locked.id,
                  track: "remote" as const,
                  versionNumber: newVersionNumber,
                  fieldName: change.fieldName,
                  oldValue: change.oldValue,
                  newValue: change.newValue,
                })),
              );
            }

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

            // When game details are unavailable, preserve existing detail-sourced
            // fields to avoid regressing valid data to null.
            if (!details) {
              if (
                remoteSnapshot.homeHalftimeScore == null &&
                !overriddenSet.has("homeHalftimeScore")
              ) {
                updateSet.homeHalftimeScore = locked.homeHalftimeScore;
              }
              if (
                remoteSnapshot.guestHalftimeScore == null &&
                !overriddenSet.has("guestHalftimeScore")
              ) {
                updateSet.guestHalftimeScore = locked.guestHalftimeScore;
              }
              // Preserve period scores when details unavailable and snapshot has nulls
              if (
                remoteSnapshot.periodFormat == null &&
                !overriddenSet.has("periodFormat")
              ) {
                updateSet.periodFormat = locked.periodFormat;
              }
              const periodFields = [
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
              ] as const;
              for (const pf of periodFields) {
                if (remoteSnapshot[pf] == null && !overriddenSet.has(pf)) {
                  updateSet[pf] = locked[pf];
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

            return effective;
          });

          if (effectiveChanges.length > 0) {
            result.updated++;

            // Emit domain events based on what changed
            const homeTeamName = basicMatch.homeTeam?.teamname ?? "Unknown";
            const guestTeamName = basicMatch.guestTeam?.teamname ?? "Unknown";
            const leagueName = data.leagueName ?? "";
            const teamIds = [remoteSnapshot.homeTeamApiId, remoteSnapshot.guestTeamApiId];
            const matchEventTypes = classifyMatchChanges(effectiveChanges);

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
                  eventPayload.changes = effectiveChanges
                    .filter((c) => c.fieldName === "kickoffDate" || c.fieldName === "kickoffTime")
                    .map((c) => ({ field: c.fieldName, oldValue: c.oldValue, newValue: c.newValue }));
                } else if (eventType === EVENT_TYPES.MATCH_VENUE_CHANGED) {
                  const venueChange = effectiveChanges.find((c) => c.fieldName === "venueId");
                  eventPayload.oldVenueId = venueChange?.oldValue ? Number(venueChange.oldValue) : null;
                  eventPayload.oldVenueName = null;
                  eventPayload.newVenueId = venueChange?.newValue ? Number(venueChange.newValue) : null;
                  eventPayload.newVenueName = null;
                } else if (eventType === EVENT_TYPES.MATCH_RESULT_ENTERED) {
                  const homeScoreChange = effectiveChanges.find((c) => c.fieldName === "homeScore");
                  const guestScoreChange = effectiveChanges.find((c) => c.fieldName === "guestScore");
                  eventPayload.homeScore = homeScoreChange?.newValue ? Number(homeScoreChange.newValue) : 0;
                  eventPayload.guestScore = guestScoreChange?.newValue ? Number(guestScoreChange.newValue) : 0;
                } else if (eventType === EVENT_TYPES.MATCH_RESULT_CHANGED) {
                  const homeScoreChange = effectiveChanges.find((c) => c.fieldName === "homeScore");
                  const guestScoreChange = effectiveChanges.find((c) => c.fieldName === "guestScore");
                  eventPayload.oldHomeScore = homeScoreChange?.oldValue ? Number(homeScoreChange.oldValue) : 0;
                  eventPayload.oldGuestScore = guestScoreChange?.oldValue ? Number(guestScoreChange.oldValue) : 0;
                  eventPayload.newHomeScore = homeScoreChange?.newValue ? Number(homeScoreChange.newValue) : 0;
                  eventPayload.newGuestScore = guestScoreChange?.newValue ? Number(guestScoreChange.newValue) : 0;
                } else if (eventType === EVENT_TYPES.MATCH_CONFIRMED) {
                  const homeScoreChange = effectiveChanges.find((c) => c.fieldName === "homeScore");
                  const guestScoreChange = effectiveChanges.find((c) => c.fieldName === "guestScore");
                  eventPayload.homeScore = homeScoreChange?.newValue ? Number(homeScoreChange.newValue) : (remoteSnapshot.homeScore ?? null);
                  eventPayload.guestScore = guestScoreChange?.newValue ? Number(guestScoreChange.newValue) : (remoteSnapshot.guestScore ?? null);
                }

                await publishDomainEvent({
                  type: eventType as import("@dragons/shared").EventType,
                  source: "sync",
                  entityType: "match",
                  entityId: existing.id,
                  entityName,
                  deepLinkPath: `/admin/matches/${existing.id}`,
                  payload: eventPayload,
                  syncRunId,
                });
              } catch (error) {
                log.warn({ err: error, eventType, matchId: existing.id }, "Failed to emit match event");
              }
            }

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
          // Create new match
          const [newMatch] = await db
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
            await db.insert(matchRemoteVersions).values({
              matchId: newMatch.id,
              versionNumber: 1,
              syncRunId,
              snapshot: remoteSnapshot as unknown as CurrentRemoteSnapshot,
              dataHash: newHash,
            });
          }

          result.created++;

          // Emit match.created event for new match
          if (newMatch) {
            try {
              await publishDomainEvent({
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
              });
            } catch (error) {
              log.warn({ err: error, matchId: newMatch.id }, "Failed to emit match.created event");
            }

          }

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
