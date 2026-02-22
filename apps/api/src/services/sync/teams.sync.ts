import { db } from "../../config/database";
import { teams } from "@dragons/db/schema";
import { sql, and, eq, ne } from "drizzle-orm";
import { computeEntityHash } from "./hash";
import { getClubConfig } from "../admin/settings.service";
import type { SdkTeamRef } from "@dragons/sdk";
import type { SyncLogger } from "./sync-logger";

export interface TeamsSyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  durationMs: number;
}

function teamHashData(teamRef: SdkTeamRef): Record<string, unknown> {
  return {
    teamPermanentId: teamRef.teamPermanentId,
    seasonTeamId: teamRef.seasonTeamId,
    teamCompetitionId: teamRef.teamCompetitionId,
    teamname: teamRef.teamname,
    teamnameSmall: teamRef.teamnameSmall,
    clubId: teamRef.clubId,
    verzicht: teamRef.verzicht,
  };
}

export async function syncTeamsFromData(
  teamsMap: Map<number, SdkTeamRef>,
  logger?: SyncLogger,
): Promise<TeamsSyncResult> {
  const startedAt = Date.now();
  const result: TeamsSyncResult = {
    total: teamsMap.size,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  };

  if (teamsMap.size === 0) {
    return result;
  }

  console.log(`[Teams Sync] Batch syncing ${teamsMap.size} unique teams...`);

  const clubConfig = await getClubConfig();
  const ownClubId = clubConfig?.clubId ?? 0;
  const now = new Date();

  const teamRecords = Array.from(teamsMap.entries()).map(([permanentId, teamRef]) => ({
    apiTeamPermanentId: permanentId,
    seasonTeamId: teamRef.seasonTeamId,
    teamCompetitionId: teamRef.teamCompetitionId,
    name: teamRef.teamname,
    nameShort: teamRef.teamnameSmall || null,
    clubId: teamRef.clubId,
    isOwnClub: teamRef.clubId === ownClubId,
    verzicht: teamRef.verzicht,
    dataHash: computeEntityHash(teamHashData(teamRef)),
    createdAt: now,
    updatedAt: now,
  }));

  try {
    const upsertResult = await db
      .insert(teams)
      .values(teamRecords)
      .onConflictDoUpdate({
        target: teams.apiTeamPermanentId,
        set: {
          seasonTeamId: sql`excluded.season_team_id`,
          teamCompetitionId: sql`excluded.team_competition_id`,
          name: sql`excluded.name`,
          nameShort: sql`excluded.name_short`,
          clubId: sql`excluded.club_id`,
          isOwnClub: sql`excluded.is_own_club`,
          verzicht: sql`excluded.verzicht`,
          dataHash: sql`excluded.data_hash`,
          updatedAt: now,
        },
        setWhere: sql`excluded.data_hash != ${teams.dataHash}`,
      })
      .returning({ id: teams.id, createdAt: teams.createdAt });

    for (const row of upsertResult) {
      if (row.createdAt.getTime() === now.getTime()) {
        result.created++;
      } else {
        result.updated++;
      }
    }
    result.skipped = result.total - upsertResult.length - result.failed;

    console.log(`[Teams Sync] Batch synced ${upsertResult.length} teams (${result.created} created, ${result.updated} updated, ${result.skipped} skipped)`);
    await logger?.log({
      entityType: "team",
      entityId: "batch",
      action: "updated",
      message: `Batch synced ${upsertResult.length} teams (${result.created} created, ${result.updated} updated, ${result.skipped} skipped)`,
      metadata: { created: result.created, updated: result.updated, skipped: result.skipped },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`Batch team sync failed: ${message}`);
    result.failed = teamsMap.size;
    console.error("[Teams Sync] Batch sync error:", error);
    await logger?.log({
      entityType: "team",
      entityId: "batch",
      action: "failed",
      message: `Batch team sync failed: ${message}`,
    });
  }

  // Corrective pass: fix isOwnClub for teams whose hash didn't change
  if (ownClubId > 0) {
    const markOwn = await db
      .update(teams)
      .set({ isOwnClub: true, updatedAt: now })
      .where(and(eq(teams.clubId, ownClubId), eq(teams.isOwnClub, false)))
      .returning({ id: teams.id });

    const unmarkOwn = await db
      .update(teams)
      .set({ isOwnClub: false, updatedAt: now })
      .where(and(ne(teams.clubId, ownClubId), eq(teams.isOwnClub, true)))
      .returning({ id: teams.id });

    if (markOwn.length > 0 || unmarkOwn.length > 0) {
      console.log(`[Teams Sync] Corrected isOwnClub: ${markOwn.length} marked, ${unmarkOwn.length} unmarked`);
    }
  }

  result.durationMs = Date.now() - startedAt;
  console.log(`[Teams Sync] Completed in ${result.durationMs}ms: ${result.total} total, ${result.errors.length} errors`);

  return result;
}

export async function buildTeamIdLookup(): Promise<Map<number, number>> {
  const allTeams = await db
    .select({ id: teams.id, apiTeamPermanentId: teams.apiTeamPermanentId })
    .from(teams);
  return new Map(allTeams.map((t) => [t.apiTeamPermanentId, t.id]));
}
