import { db } from "../../config/database";
import {
  matches,
  matchOverrides,
  matchRemoteVersions,
  matchChanges,
} from "@dragons/db/schema";
import { eq, and } from "drizzle-orm";
import { parseResult } from "@dragons/sdk";
import type { SdkSpielplanMatch, SdkGetGameResponse } from "@dragons/sdk";
import type { LeagueFetchedData } from "./data-fetcher";
import { computeEntityHash } from "./hash";
import type { SyncLogger } from "./sync-logger";
import { logger } from "../../config/logger";

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

interface PeriodScores {
  periodFormat: "quarters" | null;
  homeQ1: number | null;
  guestQ1: number | null;
  homeQ2: number | null;
  guestQ2: number | null;
  homeQ3: number | null;
  guestQ3: number | null;
  homeQ4: number | null;
  guestQ4: number | null;
}

interface OvertimeDeltas {
  homeOt1: number | null;
  guestOt1: number | null;
  homeOt2: number | null;
  guestOt2: number | null;
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
}

function validScoreOrNull(score: number | undefined): number | null {
  if (score === undefined || score < 0) return null;
  return score;
}

function delta(
  cumLater: number | null,
  cumEarlier: number | null,
): number | null {
  if (cumLater == null || cumEarlier == null) return null;
  return cumLater - cumEarlier;
}

export function extractPeriodScores(
  game: SdkGetGameResponse["game1"] | undefined,
): PeriodScores {
  const nullScores: PeriodScores = {
    periodFormat: null,
    homeQ1: null,
    guestQ1: null,
    homeQ2: null,
    guestQ2: null,
    homeQ3: null,
    guestQ3: null,
    homeQ4: null,
    guestQ4: null,
  };

  if (!game) return nullScores;

  const validScore = (score: number | undefined) =>
    score !== undefined && score >= 0 ? score : null;

  // When V5-V8 fields are present the game uses achtel (8-period) format.
  // We don't extract per-period data for achtel — just return nulls so the
  // caller falls back to end-result only.
  const hasV5to8 =
    game.heimV5stand !== undefined ||
    game.heimV6stand !== undefined ||
    game.heimV7stand !== undefined ||
    game.heimV8stand !== undefined;

  if (hasV5to8) return nullScores;

  const hasOvertime = game.heimOt1stand >= 0 || game.gastOt1stand >= 0;

  // Standard 4-quarter format: cumulative → delta
  const cumH1 = validScore(game.heimV1stand);
  const cumG1 = validScore(game.gastV1stand);
  const cumH2 =
    validScore(game.heimV2stand) ?? validScore(game.heimHalbzeitstand);
  const cumG2 =
    validScore(game.gastV2stand) ?? validScore(game.gastHalbzeitstand);
  const cumH3 = validScore(game.heimV3stand);
  const cumG3 = validScore(game.gastV3stand);
  const cumH4 =
    validScore(game.heimV4stand) ??
    (hasOvertime ? null : validScore(game.heimEndstand));
  const cumG4 =
    validScore(game.gastV4stand) ??
    (hasOvertime ? null : validScore(game.gastEndstand));

  // Only set periodFormat if any Q data exists
  const hasAnyData =
    cumH1 != null ||
    cumG1 != null ||
    cumH2 != null ||
    cumG2 != null ||
    cumH3 != null ||
    cumG3 != null ||
    cumH4 != null ||
    cumG4 != null;

  return {
    periodFormat: hasAnyData ? "quarters" : null,
    homeQ1: cumH1,
    guestQ1: cumG1,
    homeQ2: delta(cumH2, cumH1),
    guestQ2: delta(cumG2, cumG1),
    homeQ3: delta(cumH3, cumH2),
    guestQ3: delta(cumG3, cumG2),
    homeQ4: delta(cumH4, cumH3),
    guestQ4: delta(cumG4, cumG3),
  };
}

export function extractOvertimeDeltas(
  game: SdkGetGameResponse["game1"] | undefined,
  periodScores: PeriodScores,
): OvertimeDeltas {
  const nullOt: OvertimeDeltas = {
    homeOt1: null,
    guestOt1: null,
    homeOt2: null,
    guestOt2: null,
  };

  if (!game) return nullOt;

  const cumOt1Home = game.heimOt1stand >= 0 ? game.heimOt1stand : null;
  const cumOt1Guest = game.gastOt1stand >= 0 ? game.gastOt1stand : null;
  const cumOt2Home = game.heimOt2stand >= 0 ? game.heimOt2stand : null;
  const cumOt2Guest = game.gastOt2stand >= 0 ? game.gastOt2stand : null;

  if (cumOt1Home == null && cumOt1Guest == null) return nullOt;

  // Compute regulation end by summing Q1-Q4 deltas
  const homePeriods = [
    periodScores.homeQ1,
    periodScores.homeQ2,
    periodScores.homeQ3,
    periodScores.homeQ4,
  ];
  const guestPeriods = [
    periodScores.guestQ1,
    periodScores.guestQ2,
    periodScores.guestQ3,
    periodScores.guestQ4,
  ];

  const sumOrNull = (values: (number | null)[]): number | null => {
    if (values.some((v) => v == null)) return null;
    return values.reduce<number>((s, v) => s + v!, 0);
  };

  const regEndHome = sumOrNull(homePeriods);
  const regEndGuest = sumOrNull(guestPeriods);

  return {
    homeOt1: delta(cumOt1Home, regEndHome),
    guestOt1: delta(cumOt1Guest, regEndGuest),
    homeOt2: delta(cumOt2Home, cumOt1Home),
    guestOt2: delta(cumOt2Guest, cumOt1Guest),
  };
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
] as const;

function detectFieldChanges(
  existing: typeof matches.$inferSelect,
  snapshot: RemoteSnapshot,
): Array<{
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
}> {
  const changes: Array<{
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
  }> = [];
  type FieldValue = string | number | boolean | null | undefined;
  const stringify = (v: FieldValue) =>
    v === null || v === undefined ? null : String(v);

  /** Normalize time strings so "10:30:00" and "10:30" compare equal */
  const normalizeTime = (v: string | null) =>
    v !== null ? v.replace(/^(\d{2}:\d{2}):00$/, "$1") : v;

  for (const name of TRACKED_FIELDS) {
    const old = existing[name as keyof typeof existing] as FieldValue;
    const nw = snapshot[name as keyof RemoteSnapshot] as FieldValue;
    let oldStr = stringify(old);
    let newStr = stringify(nw);
    if (name === "kickoffTime") {
      oldStr = normalizeTime(oldStr);
      newStr = normalizeTime(newStr);
    }
    if (oldStr !== newStr) {
      changes.push({
        fieldName: name,
        oldValue: oldStr,
        newValue: newStr,
      });
    }
  }

  return changes;
}

/** Compare locked DB row against effective update values to determine real changes */
function computeEffectiveChanges(
  locked: typeof matches.$inferSelect,
  updateSet: Record<string, unknown>,
): Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> {
  const changes: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> = [];
  type FieldValue = string | number | boolean | null | undefined;
  const stringify = (v: FieldValue) =>
    v === null || v === undefined ? null : String(v);

  const normalizeTime = (v: string | null) =>
    v !== null ? v.replace(/^(\d{2}:\d{2}):00$/, "$1") : v;

  for (const field of SNAPSHOT_DB_FIELDS) {
    if (!(field in updateSet)) continue;
    const old = locked[field as keyof typeof locked] as FieldValue;
    const nw = updateSet[field] as FieldValue;
    let oldStr = stringify(old);
    let newStr = stringify(nw);
    if (field === "kickoffTime") {
      oldStr = normalizeTime(oldStr);
      newStr = normalizeTime(newStr);
    }
    if (oldStr !== newStr) {
      changes.push({ fieldName: field, oldValue: oldStr, newValue: newStr });
    }
  }

  return changes;
}

/** Snapshot fields that map to matches table columns (excluding venueApiId which maps to venueId) */
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
] as const;

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

      try {
        if (!basicMatch.homeTeam || !basicMatch.guestTeam) {
          result.skipped++;
          await logger?.log({
            entityType: "match",
            entityId: String(apiMatchId),
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

        const [existing] = await db
          .select()
          .from(matches)
          .where(eq(matches.apiMatchId, apiMatchId))
          .limit(1);

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

            // Create version snapshot
            await tx.insert(matchRemoteVersions).values({
              matchId: locked.id,
              versionNumber: newVersionNumber,
              syncRunId,
              snapshot: remoteSnapshot,
              dataHash: newHash,
            });

            // Create field-level changes (audit trail)
            if (fieldChanges.length > 0) {
              await tx.insert(matchChanges).values(
                fieldChanges.map((change) => ({
                  matchId: locked.id,
                  track: "remote",
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

            // Auto-release: if remote matches current effective value
            for (const fieldName of overriddenSet) {
              const remoteVal = String(
                remoteSnapshot[fieldName as keyof RemoteSnapshot] ?? "",
              );
              const lockedVal = String(
                locked[fieldName as keyof typeof locked] ?? "",
              );
              if (remoteVal === lockedVal) {
                await tx
                  .delete(matchOverrides)
                  .where(
                    and(
                      eq(matchOverrides.matchId, locked.id),
                      eq(matchOverrides.fieldName, fieldName),
                    ),
                  );
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
            await logger?.log({
              entityType: "match",
              entityId: String(apiMatchId),
              action: "updated",
              message: `Updated match ${apiMatchId}`,
            });
          } else {
            result.skipped++;
            await logger?.log({
              entityType: "match",
              entityId: String(apiMatchId),
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
              snapshot: remoteSnapshot,
              dataHash: newHash,
            });
          }

          result.created++;
          await logger?.log({
            entityType: "match",
            entityId: String(apiMatchId),
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
