import { getDb } from "../../config/database";
import { leagues } from "@dragons/db/schema";
import { eq, and, notInArray } from "drizzle-orm";
import { sdkClient } from "../sync/sdk-client";
import { getActiveSeasonId } from "./season.service";
import { getClubConfig } from "./settings.service";
import type { SdkLiga } from "@dragons/sdk";
import type {
  BrowsableLeague,
  SetSeasonLeaguesResult,
  TrackedLeaguesResponse,
} from "@dragons/shared";

// The federation never flags the top tiers (Regionalliga and up) as `vorabliga`:
// promotion/relegation there is settled before the season, so they're published
// as committed leagues from the start. A club playing in the Regionalliga still
// needs to pick it during new-season onboarding, so the vorabliga-only browse
// surfaces these alongside the genuine vorabligas. Matched on `skName` (the
// Spielklasse tier), e.g. "1.Regionalliga" / "2.Regionalliga".
function isOnboardableTopTier(l: SdkLiga): boolean {
  return (l.skName ?? "").toLowerCase().includes("regionalliga");
}

// The WAM liga-list carries no club/team reference, so to narrow the browse to
// leagues our own club plays in we ask the federation's club-matches endpoint
// which leagues our club has fixtures in and intersect by ligaId. One call, and
// it covers vorabligas too — preliminary leagues already ship full schedules.
async function ownClubLigaIds(): Promise<Set<number> | null> {
  const club = await getClubConfig();
  if (!club) return null; // not configured → cannot filter, fall back to unfiltered
  const res = await sdkClient.getClubMatches(club.clubId);
  return new Set(res.matches.map((m) => m.ligaData.ligaId));
}

export async function browseLeagues(
  opts: { vorabligaOnly?: boolean; ownClubOnly?: boolean; seasonId?: number } = {},
): Promise<BrowsableLeague[]> {
  const all = await sdkClient.getAllLigen();
  const byTier = opts.vorabligaOnly
    ? all.filter((l) => l.vorabliga === true || isOnboardableTopTier(l))
    : all;

  const ourLigaIds = opts.ownClubOnly ? await ownClubLigaIds() : null;
  const filtered = ourLigaIds ? byTier.filter((l) => ourLigaIds.has(l.ligaId)) : byTier;

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
