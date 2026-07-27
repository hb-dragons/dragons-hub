import { getDb } from "../../config/database";
import { leagues } from "@dragons/db/schema";
import { eq, and, notInArray } from "drizzle-orm";
import { sdkClient } from "../sync/sdk-client";
import type { SdkLiga } from "@dragons/sdk";
import type {
  ResolvedLeague,
  ResolveResult,
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

  const matchedLigaIds = Array.from(matchedByLigaNr.values()).map((l) => l.ligaId);

  // The tracked set is replaced as a whole: every matched league is tracked and
  // everything else is untracked. Split across statements outside a transaction,
  // a failure part-way through leaves the configuration half-applied — some
  // leagues tracked, some already untracked — and a concurrent read (the sync
  // picks its work from `isTracked`) can observe that state. One transaction,
  // and the per-league SELECT-then-INSERT-or-UPDATE becomes a single atomic
  // upsert on the `api_liga_id` unique constraint, so two callers resolving the
  // same league cannot both take the insert branch.
  const untrackedCount = await getDb().transaction(async (tx) => {
    const now = new Date();

    for (const liga of matchedByLigaNr.values()) {
      const values = {
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
        updatedAt: now,
      };

      await tx
        .insert(leagues)
        .values({
          apiLigaId: liga.ligaId,
          isActive: true,
          discoveredAt: now,
          ...values,
        })
        .onConflictDoUpdate({
          target: leagues.apiLigaId,
          // `isActive` and `discoveredAt` are insert-only: a league that was
          // deactivated locally must not be silently reactivated, and the
          // original discovery timestamp is history.
          set: values,
        });
    }

    // Untrack leagues that are no longer in the set
    const untracked = await tx
      .update(leagues)
      .set({ isTracked: false, updatedAt: now })
      .where(
        matchedLigaIds.length > 0
          ? and(eq(leagues.isTracked, true), notInArray(leagues.apiLigaId, matchedLigaIds))
          : eq(leagues.isTracked, true),
      )
      .returning({ id: leagues.id });

    return untracked.length;
  });

  return {
    resolved,
    notFound,
    tracked: matchedByLigaNr.size,
    untracked: untrackedCount,
  };
}

export async function getTrackedLeagues(): Promise<TrackedLeaguesResponse> {
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
  await getDb()
    .update(leagues)
    .set({ ownClubRefs, updatedAt: new Date() })
    .where(eq(leagues.id, leagueId));
}
