import { getClubConfig } from "../admin/settings.service";
import { upsertEntryFromEvidence, type UpsertEntryOutcome } from "../admin/team-entry-seeding.service";
import { getDb } from "../../config/database";
import { teams } from "@dragons/db/schema";
import { inArray } from "drizzle-orm";
import type { LeagueFetchedData } from "./data-fetcher";
import type { SyncLogger } from "./sync-logger";
import { logger } from "../../config/logger";

const log = logger.child({ service: "team-entries-sync" });

export interface TeamEntriesSyncResult {
  total: number;
  created: number;
  moved: number;
  unchanged: number;
  supersededManual: number;
  /** Entries left untouched because the run's evidence was ambiguous (issue #228). */
  kept: number;
  /** Squads whose evidence was ambiguous, whatever the resolution — overlaps the action counters above. */
  conflicts: number;
  errors: string[];
  durationMs: number;
}

/**
 * Reconcile team entries from federation evidence. One squad appearing in two
 * of a season's leagues in one run resolves committed-beats-vorabliga (spec
 * 2026-08-12); evidence beats a manual link and the supersession is logged.
 *
 * Ambiguous evidence — two committed leagues, or two vorabligas with no
 * committed league — is a conflict (issue #228): an existing link is kept
 * untouched and the conflict is written to the sync log. `leagueData` comes
 * from an unordered SELECT, so a squad with no link yet falls back to the
 * lowest federation liga id rather than whichever league was seen first — the
 * federation id is stable across databases, the local row id is not.
 */
/** How an ambiguous run resolved, phrased for the sync log. */
function conflictResolution(outcome: UpsertEntryOutcome, resolvedLeagueId: number): string {
  if (outcome.action === "kept") return `kept the existing link (league ${outcome.keptLeagueId})`;
  if (outcome.action === "created") return `no entry existed, so the lowest liga id (league ${resolvedLeagueId}) was used`;
  return `the entry now points at the lowest liga id (league ${resolvedLeagueId})`;
}

export async function syncTeamEntriesFromData(
  leagueData: LeagueFetchedData[],
  syncLogger?: SyncLogger,
): Promise<TeamEntriesSyncResult> {
  const startedAt = Date.now();
  const result: TeamEntriesSyncResult = {
    total: 0, created: 0, moved: 0, unchanged: 0, supersededManual: 0, kept: 0, conflicts: 0, errors: [], durationMs: 0,
  };

  const ownClubId = (await getClubConfig())?.clubId ?? null;
  if (ownClubId === null) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // candidates: (seasonRefId, teamPermanentId) -> every league that supplied the squad
  const candidates = new Map<
    string,
    {
      permanentId: number;
      seasonRefId: number;
      leagues: { leagueDbId: number; leagueApiId: number; vorabliga: boolean }[];
    }
  >();
  for (const data of leagueData) {
    if (data.leagueDbId === null || data.seasonRefId === null) continue;
    const permanentIds = new Set<number>();
    for (const entry of data.tabelle) {
      if (entry.team?.teamPermanentId && entry.team.clubId === ownClubId) permanentIds.add(entry.team.teamPermanentId);
    }
    for (const m of data.spielplan) {
      for (const side of [m.homeTeam, m.guestTeam]) {
        if (side?.teamPermanentId && side.clubId === ownClubId) permanentIds.add(side.teamPermanentId);
      }
    }
    for (const pid of permanentIds) {
      const key = `${data.seasonRefId}:${pid}`;
      let bucket = candidates.get(key);
      if (!bucket) {
        bucket = { permanentId: pid, seasonRefId: data.seasonRefId, leagues: [] };
        candidates.set(key, bucket);
      }
      bucket.leagues.push({ leagueDbId: data.leagueDbId, leagueApiId: data.leagueApiId, vorabliga: data.vorabliga });
    }
  }

  // committed (vorabliga=false) beats vorabliga; anything left over is a conflict.
  const evidence = [...candidates.values()].map((bucket) => {
    const committed = bucket.leagues.filter((l) => !l.vorabliga);
    const byDbId = new Map((committed.length > 0 ? committed : bucket.leagues).map((l) => [l.leagueDbId, l]));
    const pool = [...byDbId.values()].sort((a, b) => a.leagueApiId - b.leagueApiId);
    return {
      permanentId: bucket.permanentId,
      seasonRefId: bucket.seasonRefId,
      leagueDbId: pool[0]!.leagueDbId,
      conflictingLigaIds: pool.length > 1 ? pool.map((l) => l.leagueApiId) : null,
    };
  });

  if (evidence.length === 0) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const permanentIds = [...new Set(evidence.map((e) => e.permanentId))];
  const squadRows = await getDb()
    .select({ id: teams.id, apiTeamPermanentId: teams.apiTeamPermanentId })
    .from(teams)
    .where(inArray(teams.apiTeamPermanentId, permanentIds));
  const squadIdByPermanent = new Map(squadRows.map((t) => [t.apiTeamPermanentId, t.id]));

  for (const e of evidence) {
    const teamId = squadIdByPermanent.get(e.permanentId);
    if (teamId === undefined) continue; // squad row lands via teams.sync in the same run
    result.total++;
    try {
      const outcome = await upsertEntryFromEvidence(teamId, e.seasonRefId, e.leagueDbId, {
        keepExistingLink: e.conflictingLigaIds !== null,
      });
      if (e.conflictingLigaIds !== null) {
        result.conflicts++;
        await syncLogger?.log({
          entityType: "team",
          entityId: String(e.permanentId),
          action: "skipped",
          message: `Team ${e.permanentId} appears in leagues ${e.conflictingLigaIds.join(", ")} of one season; ${conflictResolution(outcome, e.leagueDbId)}`,
          metadata: { ligaIds: e.conflictingLigaIds.join(","), resolvedLeagueId: e.leagueDbId },
        });
      }
      if (outcome.action === "created") result.created++;
      else if (outcome.action === "moved") {
        result.moved++;
        if (outcome.previousSource === "manual") {
          result.supersededManual++;
          await syncLogger?.log({
            entityType: "team",
            entityId: String(e.permanentId),
            action: "updated",
            message: `Federation evidence superseded a manual league link (team ${e.permanentId} -> league ${e.leagueDbId})`,
          });
        }
      } else if (outcome.action === "kept") result.kept++;
      else result.unchanged++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`Entry reconcile failed for team ${e.permanentId}: ${message}`);
      log.error({ err: error, permanentId: e.permanentId }, "Entry reconcile failed");
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}
