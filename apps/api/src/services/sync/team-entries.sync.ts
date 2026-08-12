import { getClubConfig } from "../admin/settings.service";
import { upsertEntryFromEvidence } from "../admin/team-entry-seeding.service";
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
  errors: string[];
  durationMs: number;
}

/**
 * Reconcile team entries from federation evidence. One squad appearing in two
 * of a season's leagues in one run resolves committed-beats-vorabliga (spec
 * 2026-08-12); evidence beats a manual link and the supersession is logged.
 */
export async function syncTeamEntriesFromData(
  leagueData: LeagueFetchedData[],
  syncLogger?: SyncLogger,
): Promise<TeamEntriesSyncResult> {
  const startedAt = Date.now();
  const result: TeamEntriesSyncResult = {
    total: 0, created: 0, moved: 0, unchanged: 0, supersededManual: 0, errors: [], durationMs: 0,
  };

  const ownClubId = (await getClubConfig())?.clubId ?? null;
  if (ownClubId === null) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // evidence: (seasonRefId, teamPermanentId) -> chosen league
  const evidence = new Map<string, { leagueDbId: number; vorabliga: boolean; permanentId: number; seasonRefId: number }>();
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
      const existing = evidence.get(key);
      // committed (vorabliga=false) beats vorabliga; first committed wins ties.
      if (!existing || (existing.vorabliga && !data.vorabliga)) {
        evidence.set(key, { leagueDbId: data.leagueDbId, vorabliga: data.vorabliga, permanentId: pid, seasonRefId: data.seasonRefId });
      }
    }
  }

  if (evidence.size === 0) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const permanentIds = [...new Set([...evidence.values()].map((e) => e.permanentId))];
  const squadRows = await getDb()
    .select({ id: teams.id, apiTeamPermanentId: teams.apiTeamPermanentId })
    .from(teams)
    .where(inArray(teams.apiTeamPermanentId, permanentIds));
  const squadIdByPermanent = new Map(squadRows.map((t) => [t.apiTeamPermanentId, t.id]));

  for (const e of evidence.values()) {
    const teamId = squadIdByPermanent.get(e.permanentId);
    if (teamId === undefined) continue; // squad row lands via teams.sync in the same run
    result.total++;
    try {
      const outcome = await upsertEntryFromEvidence(teamId, e.seasonRefId, e.leagueDbId);
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
      } else result.unchanged++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`Entry reconcile failed for team ${e.permanentId}: ${message}`);
      log.error({ err: error, permanentId: e.permanentId }, "Entry reconcile failed");
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}
