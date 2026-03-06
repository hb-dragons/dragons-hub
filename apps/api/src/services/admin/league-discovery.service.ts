import { db } from "../../config/database";
import { leagues } from "@dragons/db/schema";
import { eq, and, notInArray } from "drizzle-orm";
import { sdkClient } from "../sync/sdk-client";
import type { SdkLiga } from "@dragons/sdk";
import type {
  ResolvedLeague,
  ResolveResult,
  TrackedLeague,
  TrackedLeaguesResponse,
} from "@dragons/shared";

export async function resolveAndSaveLeagues(leagueNumbers: number[]): Promise<ResolveResult> {
  const allLigen = await sdkClient.getAllLigen();
  const matchedByLigaNr = new Map<number, SdkLiga>();

  for (const liga of allLigen) {
    if (leagueNumbers.includes(liga.liganr)) {
      matchedByLigaNr.set(liga.liganr, liga);
    }
  }

  const resolved: ResolvedLeague[] = [];
  const notFound: number[] = [];

  for (const nr of leagueNumbers) {
    const liga = matchedByLigaNr.get(nr);
    if (liga) {
      resolved.push({
        ligaNr: liga.liganr,
        ligaId: liga.ligaId,
        name: liga.liganame,
        seasonName: liga.seasonName ?? "",
      });
    } else {
      notFound.push(nr);
    }
  }

  // Upsert matched leagues
  for (const liga of matchedByLigaNr.values()) {
    const [existing] = await db
      .select()
      .from(leagues)
      .where(eq(leagues.apiLigaId, liga.ligaId))
      .limit(1);

    if (existing) {
      await db
        .update(leagues)
        .set({
          ligaNr: liga.liganr,
          name: liga.liganame,
          seasonId: liga.seasonId ?? 0,
          seasonName: liga.seasonName ?? "",
          skName: liga.skName || null,
          akName: liga.akName || null,
          geschlecht: liga.geschlecht || null,
          verbandId: liga.verbandId || null,
          verbandName: liga.verbandName || null,
          isTracked: true,
          updatedAt: new Date(),
        })
        .where(eq(leagues.id, existing.id));
    } else {
      await db.insert(leagues).values({
        apiLigaId: liga.ligaId,
        ligaNr: liga.liganr,
        name: liga.liganame,
        seasonId: liga.seasonId ?? 0,
        seasonName: liga.seasonName ?? "",
        skName: liga.skName || null,
        akName: liga.akName || null,
        geschlecht: liga.geschlecht || null,
        verbandId: liga.verbandId || null,
        verbandName: liga.verbandName || null,
        isActive: true,
        isTracked: true,
        discoveredAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // Untrack leagues that are no longer in the set
  const matchedLigaIds = Array.from(matchedByLigaNr.values()).map((l) => l.ligaId);
  let untrackedCount = 0;

  if (matchedLigaIds.length > 0) {
    const untrackedResult = await db
      .update(leagues)
      .set({ isTracked: false, updatedAt: new Date() })
      .where(and(eq(leagues.isTracked, true), notInArray(leagues.apiLigaId, matchedLigaIds)))
      .returning({ id: leagues.id });
    untrackedCount = untrackedResult.length;
  } else {
    // No matched leagues — untrack all
    const untrackedResult = await db
      .update(leagues)
      .set({ isTracked: false, updatedAt: new Date() })
      .where(eq(leagues.isTracked, true))
      .returning({ id: leagues.id });
    untrackedCount = untrackedResult.length;
  }

  return {
    resolved,
    notFound,
    tracked: matchedByLigaNr.size,
    untracked: untrackedCount,
  };
}

export async function getTrackedLeagues(): Promise<TrackedLeaguesResponse> {
  const tracked = await db
    .select({
      id: leagues.id,
      ligaNr: leagues.ligaNr,
      apiLigaId: leagues.apiLigaId,
      name: leagues.name,
      seasonName: leagues.seasonName,
      ownClubRefs: leagues.ownClubRefs,
    })
    .from(leagues)
    .where(eq(leagues.isTracked, true));

  return {
    leagueNumbers: tracked.map((l) => l.ligaNr),
    leagues: tracked.map((l) => ({ ...l, ownClubRefs: l.ownClubRefs ?? false })),
  };
}

export async function setLeagueOwnClubRefs(
  leagueId: number,
  ownClubRefs: boolean,
): Promise<void> {
  await db
    .update(leagues)
    .set({ ownClubRefs, updatedAt: new Date() })
    .where(eq(leagues.id, leagueId));
}
