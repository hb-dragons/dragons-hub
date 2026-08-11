// apps/api/src/services/admin/season.service.ts
import { getDb } from "../../config/database";
import { seasons, leagues, matches } from "@dragons/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { Season, SeasonSummary, SeasonWithCounts } from "@dragons/shared";
import { SeasonNotFoundError } from "./season.errors";
import { sdkClient } from "../sync/sdk-client";

function toDto(row: typeof seasons.$inferSelect): Season {
  return {
    id: row.id,
    name: row.name,
    sdkSeasonId: row.sdkSeasonId,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

let activeIdCache: { value: number | null; at: number } | null = null;
const ACTIVE_TTL_MS = 60_000;

export function invalidateActiveSeasonCache(): void {
  activeIdCache = null;
}

export async function getActiveSeason(): Promise<Season | null> {
  const [row] = await getDb().select().from(seasons).where(eq(seasons.status, "active")).limit(1);
  return row ? toDto(row) : null;
}

export async function getActiveSeasonId(): Promise<number | null> {
  const now = Date.now();
  if (activeIdCache && now - activeIdCache.at < ACTIVE_TTL_MS) return activeIdCache.value;
  const season = await getActiveSeason();
  activeIdCache = { value: season?.id ?? null, at: now };
  return activeIdCache.value;
}

export async function createSeason(input: {
  name: string;
  sdkSeasonId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<Season> {
  const [row] = await getDb()
    .insert(seasons)
    .values({
      name: input.name,
      sdkSeasonId: input.sdkSeasonId ?? null,
      status: "upcoming",
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to create season");
  return toDto(row);
}

export async function listSeasons(): Promise<SeasonWithCounts[]> {
  const rows = await getDb()
    .select({
      id: seasons.id,
      name: seasons.name,
      sdkSeasonId: seasons.sdkSeasonId,
      status: seasons.status,
      startDate: seasons.startDate,
      endDate: seasons.endDate,
      createdAt: seasons.createdAt,
      updatedAt: seasons.updatedAt,
      leagueCount: sql<number>`count(distinct ${leagues.id})::int`,
      // Games are what an admin is actually checking for when preparing a
      // season — a season with leagues but no fixtures means the sync has not
      // run yet. Counted through the league join, since matches carry no season
      // of their own.
      gameCount: sql<number>`count(distinct ${matches.id})::int`,
    })
    .from(seasons)
    .leftJoin(leagues, eq(leagues.seasonRefId, seasons.id))
    .leftJoin(matches, eq(matches.leagueId, leagues.id))
    .groupBy(seasons.id)
    .orderBy(seasons.createdAt);
  return rows.map((r) => ({
    ...toDto(r),
    leagueCount: r.leagueCount,
    gameCount: r.gameCount,
  }));
}

export async function activateSeason(id: number): Promise<Season> {
  const result = await getDb().transaction(async (tx) => {
    await tx
      .update(seasons)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(seasons.status, "active"));
    const [row] = await tx
      .update(seasons)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(seasons.id, id))
      .returning();
    if (!row) throw new SeasonNotFoundError(id);
    return row;
  });
  invalidateActiveSeasonCache();
  return toDto(result);
}

// The federation scan is one serial `getSpielplan` per tracked league, each
// behind the shared rate limiter and up to 3 retries, all while an admin waits
// on the HTTP response. Cap the whole scan rather than the individual calls:
// what matters is when the request stops being interactive.
const PLACEHOLDER_SCAN_DEADLINE_MS = 15_000;

/**
 * Counts the fixture slots the federation has not yet assigned a team to.
 * Returns `null` when any league is unreadable — a partial total reads as a
 * confidently low one, so we report nothing instead.
 */
async function countPlaceholderSlots(apiLigaIds: number[]): Promise<number | null> {
  let placeholderSlots = 0;
  for (const apiLigaId of apiLigaIds) {
    try {
      const schedule = await sdkClient.getSpielplan(apiLigaId);
      for (const match of schedule) {
        if (!match.homeTeam?.teamPermanentId) placeholderSlots += 1;
        if (!match.guestTeam?.teamPermanentId) placeholderSlots += 1;
      }
    } catch {
      return null;
    }
  }
  return placeholderSlots;
}

/**
 * Counts for the wizard's review step.
 *
 * `leagueCount` / `gameCount` are database reads. `placeholderSlots` cannot be:
 * a fixture whose teams the federation has not yet assigned arrives with
 * `teamPermanentId: 0`, `data-fetcher` drops those teams, and `matches.sync`
 * then skips the whole match because the team FKs are non-deferrable (#133).
 * Neither table records the slot, so we re-read the schedule to count them —
 * which is also what explains `gameCount` trailing the published schedule.
 *
 * The long-term fix is to stop reading the federation here at all:
 * `data-fetcher` already logs every TBD slot it drops, so persisting that count
 * per sync run would turn this into a plain database read and remove the
 * fan-out along with its deadline. Not done yet.
 */
export async function getSeasonSummary(
  seasonId: number,
  /** `placeholderDeadlineMs` exists so tests can shorten the scan deadline. */
  options: { placeholderDeadlineMs?: number } = {},
): Promise<SeasonSummary> {
  const [counts] = await getDb()
    .select({
      leagueCount: sql<number>`count(distinct ${leagues.id})::int`,
      gameCount: sql<number>`count(distinct ${matches.id})::int`,
    })
    .from(seasons)
    .leftJoin(leagues, eq(leagues.seasonRefId, seasons.id))
    .leftJoin(matches, eq(matches.leagueId, leagues.id))
    .where(eq(seasons.id, seasonId))
    .groupBy(seasons.id);
  // No row means no such season. Answering 200 with zeroed counts would tell
  // the onboarding review "this season is empty", which is a different fact.
  if (!counts) throw new SeasonNotFoundError(seasonId);

  const tracked = await getDb()
    .select({ apiLigaId: leagues.apiLigaId })
    .from(leagues)
    .where(and(eq(leagues.seasonRefId, seasonId), eq(leagues.isTracked, true)));

  // On expiry the scan keeps running to completion in the background — there is
  // nothing to cancel an in-flight SDK call with — but the response no longer
  // waits for it, and the UI renders the missing count as "—".
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), options.placeholderDeadlineMs ?? PLACEHOLDER_SCAN_DEADLINE_MS);
  });
  let placeholderSlots: number | null;
  try {
    placeholderSlots = await Promise.race([
      countPlaceholderSlots(tracked.map((l) => l.apiLigaId)),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }

  return {
    leagueCount: counts.leagueCount,
    gameCount: counts.gameCount,
    placeholderSlots,
  };
}

export async function archiveSeason(id: number): Promise<Season> {
  const [row] = await getDb()
    .update(seasons)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(seasons.id, id))
    .returning();
  if (!row) throw new SeasonNotFoundError(id);
  invalidateActiveSeasonCache();
  return toDto(row);
}
