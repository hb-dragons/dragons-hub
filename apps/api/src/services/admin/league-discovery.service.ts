import { getDb } from "../../config/database";
import { leagues, seasons } from "@dragons/db/schema";
import { eq, ne, and, inArray, notInArray } from "drizzle-orm";
import { sdkClient } from "../sync/sdk-client";
import { getActiveSeasonId } from "./season.service";
import { getClubConfig } from "./settings.service";
import { fetchLeagueRoster } from "./league-roster";
import { seedSeasonTeamEntries } from "./team-entry-seeding.service";
import type { SdkLiga } from "@dragons/sdk";
import type {
  BrowsableLeague,
  LeagueSeasonConflict,
  SetSeasonLeaguesResult,
  TrackedLeaguesResponse,
  LeagueTeamsResponse,
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
  return new Set(
    res.matches
      .map((m) => m.ligaData?.ligaId)
      .filter((id): id is number => id != null),
  );
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

  // A liga whose row belongs to another season cannot be tracked here — the
  // upsert refuses to move it (#227) — so name the owner in the list rather
  // than letting the admin find out from a warning after saving. Browsing
  // without a season is the wizard's case: the season does not exist yet, so
  // every existing row is another season's by definition.
  const owned = await getDb()
    .select({ apiLigaId: leagues.apiLigaId, seasonName: seasons.name })
    .from(leagues)
    .innerJoin(seasons, eq(seasons.id, leagues.seasonRefId))
    .where(opts.seasonId !== undefined ? ne(leagues.seasonRefId, opts.seasonId) : undefined);
  const conflictSeasonByLigaId = new Map(owned.map((o) => [o.apiLigaId, o.seasonName]));

  return filtered.map((l) => ({
    ligaId: l.ligaId,
    ligaNr: l.liganr,
    name: l.liganame,
    skName: l.skName,
    akName: l.akName,
    geschlecht: l.geschlecht,
    vorabliga: l.vorabliga,
    alreadyTracked: trackedIds.has(l.ligaId),
    conflictSeasonName: conflictSeasonByLigaId.get(l.ligaId) ?? null,
  }));
}

export async function setSeasonLeagues(
  seasonId: number,
  ligaIds: number[],
): Promise<SetSeasonLeaguesResult> {
  const all = await sdkClient.getAllLigen();
  const byId = new Map<number, SdkLiga>(all.map((l) => [l.ligaId, l]));
  const selected = ligaIds.map((id) => byId.get(id)).filter((l): l is SdkLiga => Boolean(l));

  // The season's tracked set is replaced as a whole: every selected league is
  // tracked and everything else in *this* season is untracked. Split across
  // statements outside a transaction, a failure part-way through leaves the
  // season half-configured — some leagues tracked, some already untracked — and
  // a concurrent read (the sync picks its work from `isTracked`) can observe
  // that state. One transaction, and the per-league SELECT-then-INSERT-or-UPDATE
  // becomes a single atomic upsert on the `api_liga_id` unique constraint, so
  // two callers selecting the same league cannot both take the insert branch.
  const selectedIds = selected.map((l) => l.ligaId);
  const { conflicts, keepIds, untrackedCount } = await getDb().transaction(async (tx) => {
    const now = new Date();

    // A liga whose row already belongs to another season is refused, not moved.
    // `api_liga_id` is globally unique and matches, standings and team entries
    // all reference `leagues.id`, so re-scoping the row would drag a finished
    // season's data into this one and corrupt both. The federation mints a
    // fresh liga ID per season, so this only happens when it reuses one — an
    // anomaly for an admin to resolve, not for us to guess at (#227).
    const owned =
      selectedIds.length > 0
        ? await tx
            .select({
              apiLigaId: leagues.apiLigaId,
              ownedBySeasonId: leagues.seasonRefId,
              ownedBySeasonName: seasons.name,
            })
            .from(leagues)
            .innerJoin(seasons, eq(seasons.id, leagues.seasonRefId))
            .where(and(inArray(leagues.apiLigaId, selectedIds), ne(leagues.seasonRefId, seasonId)))
        : [];
    const ownedByLigaId = new Map(owned.map((o) => [o.apiLigaId, o]));
    const conflicts = selected
      .filter((l) => ownedByLigaId.has(l.ligaId))
      .map<LeagueSeasonConflict>((l) => {
        const owner = ownedByLigaId.get(l.ligaId)!;
        return {
          ligaId: l.ligaId,
          name: l.liganame,
          ownedBySeasonId: owner.ownedBySeasonId,
          ownedBySeasonName: owner.ownedBySeasonName,
        };
      });
    const trackable = selected.filter((l) => !ownedByLigaId.has(l.ligaId));
    const keepIds = trackable.map((l) => l.ligaId);

    for (const l of trackable) {
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
        updatedAt: now,
      };

      await tx
        .insert(leagues)
        .values({
          apiLigaId: l.ligaId,
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
          // Belt and braces on the refusal above: a caller working on another
          // season could claim the row between the scan and this statement, so
          // the update itself also declines to cross a season boundary.
          setWhere: eq(leagues.seasonRefId, seasonId),
        });
    }

    // Scoped untrack: only this season's leagues not in the new set. Other
    // seasons are never touched.
    const inThisSeason = and(eq(leagues.seasonRefId, seasonId), eq(leagues.isTracked, true));
    const untracked = await tx
      .update(leagues)
      .set({ isTracked: false, updatedAt: now })
      .where(
        keepIds.length > 0
          ? and(inThisSeason, notInArray(leagues.apiLigaId, keepIds))
          : inThisSeason,
      )
      .returning({ id: leagues.id });

    return { conflicts, keepIds, untrackedCount: untracked.length };
  });

  const seeding = await seedSeasonTeamEntries(seasonId, keepIds);
  return {
    tracked: keepIds.length,
    untracked: untrackedCount,
    entriesSeeded: seeding.entriesSeeded,
    rosterFailures: seeding.rosterFailures,
    conflicts,
  };
}

export async function getTrackedLeagues(seasonId?: number): Promise<TrackedLeaguesResponse> {
  // No season named and none active: answer with nothing rather than dropping
  // the season predicate. Falling back to an unscoped read returned every
  // season's tracked leagues at once — the archived ones alongside the live
  // ones — which is precisely what season scoping exists to prevent.
  const scopeId = seasonId !== undefined ? seasonId : await getActiveSeasonId();
  if (scopeId === null) return { leagueNumbers: [], leagues: [] };
  const where = and(eq(leagues.isTracked, true), eq(leagues.seasonRefId, scopeId));
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

// List the teams assigned to a league, so an operator can confirm they are
// tracking the right one. The standings table lists the roster even for a
// preliminary (vorabliga) league; fall back to the schedule if it is empty.
export async function getLeagueTeams(ligaId: number): Promise<LeagueTeamsResponse> {
  const ownClubId = (await getClubConfig())?.clubId ?? null;
  const refs = await fetchLeagueRoster(ligaId);
  const teams = refs.map((ref) => {
    const clubId = ref.clubId ?? null;
    return {
      teamPermanentId: ref.teamPermanentId,
      name: ref.teamname,
      clubId,
      isOwnClub: clubId !== null && ownClubId !== null && clubId === ownClubId,
    };
  });
  return { teams };
}
