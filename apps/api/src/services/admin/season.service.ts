// apps/api/src/services/admin/season.service.ts
import { getDb } from "../../config/database";
import { seasons, leagues } from "@dragons/db/schema";
import { eq, sql } from "drizzle-orm";
import type { Season, SeasonWithCounts } from "@dragons/shared";

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
      id: seasons.id, name: seasons.name, sdkSeasonId: seasons.sdkSeasonId,
      status: seasons.status, startDate: seasons.startDate, endDate: seasons.endDate,
      createdAt: seasons.createdAt, updatedAt: seasons.updatedAt,
      leagueCount: sql<number>`count(${leagues.id})::int`,
    })
    .from(seasons)
    .leftJoin(leagues, eq(leagues.seasonRefId, seasons.id))
    .groupBy(seasons.id)
    .orderBy(seasons.createdAt);
  return rows.map((r) => ({ ...toDto(r), leagueCount: r.leagueCount }));
}

export async function activateSeason(id: number): Promise<Season> {
  const result = await getDb().transaction(async (tx) => {
    await tx.update(seasons).set({ status: "archived", updatedAt: new Date() }).where(eq(seasons.status, "active"));
    const [row] = await tx
      .update(seasons)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(seasons.id, id))
      .returning();
    if (!row) throw new Error(`Season ${id} not found`);
    return row;
  });
  invalidateActiveSeasonCache();
  return toDto(result);
}

export async function archiveSeason(id: number): Promise<Season> {
  const [row] = await getDb()
    .update(seasons)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(seasons.id, id))
    .returning();
  if (!row) throw new Error(`Season ${id} not found`);
  invalidateActiveSeasonCache();
  return toDto(row);
}
