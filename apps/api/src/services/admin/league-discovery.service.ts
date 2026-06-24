import { getDb } from "../../config/database";
import { leagues } from "@dragons/db/schema";
import { eq, and, notInArray } from "drizzle-orm";
import { sdkClient } from "../sync/sdk-client";
import { getActiveSeasonId } from "./season.service";
import type { SdkLiga } from "@dragons/sdk";
import type {
  BrowsableLeague,
  SetSeasonLeaguesResult,
  TrackedLeaguesResponse,
} from "@dragons/shared";

export async function browseLeagues(
  opts: { vorabligaOnly?: boolean; seasonId?: number } = {},
): Promise<BrowsableLeague[]> {
  const all = await sdkClient.getAllLigen();
  const filtered = opts.vorabligaOnly ? all.filter((l) => l.vorabliga === true) : all;

  const trackedIds = new Set<number>();
  if (opts.seasonId !== undefined) {
    const tracked = await getDb()
      .select({ apiLigaId: leagues.apiLigaId })
      .from(leagues)
      .where(and(eq(leagues.seasonRefId, opts.seasonId), eq(leagues.isTracked, true)));
    for (const t of tracked) trackedIds.add(t.apiLigaId);
  }

  return filtered.map((l) => ({
    ligaId: l.ligaId,
    ligaNr: l.liganr,
    name: l.liganame,
    skName: l.skName,
    akName: l.akName,
    geschlecht: l.geschlecht,
    vorabliga: l.vorabliga,
    alreadyTracked: trackedIds.has(l.ligaId),
  }));
}

export async function setSeasonLeagues(
  seasonId: number,
  ligaIds: number[],
): Promise<SetSeasonLeaguesResult> {
  const all = await sdkClient.getAllLigen();
  const byId = new Map<number, SdkLiga>(all.map((l) => [l.ligaId, l]));
  const selected = ligaIds.map((id) => byId.get(id)).filter((l): l is SdkLiga => Boolean(l));

  for (const l of selected) {
    const [existing] = await getDb()
      .select({ id: leagues.id })
      .from(leagues)
      .where(eq(leagues.apiLigaId, l.ligaId))
      .limit(1);
    const values = {
      ligaNr: l.liganr ?? 0,
      name: l.liganame,
      seasonId: l.seasonId ?? 0,
      seasonName: l.seasonName ?? "",
      skName: l.skName || null,
      akName: l.akName || null,
      geschlecht: l.geschlecht || null,
      verbandId: l.verbandId || null,
      verbandName: l.verbandName || null,
      seasonRefId: seasonId,
      vorabliga: l.vorabliga,
      isTracked: true,
      updatedAt: new Date(),
    };
    if (existing) {
      await getDb().update(leagues).set(values).where(eq(leagues.id, existing.id));
    } else {
      await getDb().insert(leagues).values({
        apiLigaId: l.ligaId,
        isActive: true,
        discoveredAt: new Date(),
        ...values,
      });
    }
  }

  // Scoped untrack: only this season's leagues not in the new set.
  const keepIds = selected.map((l) => l.ligaId);
  const untracked =
    keepIds.length > 0
      ? await getDb()
          .update(leagues)
          .set({ isTracked: false, updatedAt: new Date() })
          .where(
            and(
              eq(leagues.seasonRefId, seasonId),
              eq(leagues.isTracked, true),
              notInArray(leagues.apiLigaId, keepIds),
            ),
          )
          .returning({ id: leagues.id })
      : await getDb()
          .update(leagues)
          .set({ isTracked: false, updatedAt: new Date() })
          .where(and(eq(leagues.seasonRefId, seasonId), eq(leagues.isTracked, true)))
          .returning({ id: leagues.id });

  return { tracked: selected.length, untracked: untracked.length };
}

export async function getTrackedLeagues(seasonId?: number): Promise<TrackedLeaguesResponse> {
  const scopeId = seasonId !== undefined ? seasonId : await getActiveSeasonId();
  const where =
    scopeId === null
      ? eq(leagues.isTracked, true)
      : and(eq(leagues.isTracked, true), eq(leagues.seasonRefId, scopeId));
  const tracked = await getDb()
    .select({
      id: leagues.id,
      ligaNr: leagues.ligaNr,
      apiLigaId: leagues.apiLigaId,
      name: leagues.name,
      seasonName: leagues.seasonName,
      ownClubRefs: leagues.ownClubRefs,
    })
    .from(leagues)
    .where(where);
  return {
    leagueNumbers: tracked.map((l) => l.ligaNr),
    leagues: tracked.map((l) => ({ ...l, ownClubRefs: l.ownClubRefs ?? false })),
  };
}

export async function setLeagueOwnClubRefs(leagueId: number, ownClubRefs: boolean): Promise<void> {
  await getDb()
    .update(leagues)
    .set({ ownClubRefs, updatedAt: new Date() })
    .where(eq(leagues.id, leagueId));
}
