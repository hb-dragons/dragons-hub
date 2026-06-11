import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  getDb: () => (new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] })),
}));

// --- Imports (after mocks) ---
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";
import { matches, teams, venues, leagues, venueBookings, refereeGames } from "@dragons/db/schema";
import {
  getMatchForReschedule,
  listClubMatches,
  listVenueBookings,
  listClubVenues,
  getRoundWindow,
  getRefereeContext,
} from "./reschedule-context.service";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
beforeEach(async () => { await resetTestDb(ctx); vi.clearAllMocks(); });
afterAll(async () => { await closeTestDb(ctx); });

async function seedOwnTeam(apiId: number, name = `T${apiId}`) {
  await ctx.db.insert(teams).values({ apiTeamPermanentId: apiId, seasonTeamId: apiId, teamCompetitionId: apiId, name, clubId: 1, isOwnClub: true });
}
async function seedVenue(id: number) { await ctx.db.insert(venues).values({ id, apiId: 1000 + id, name: `Hall ${id}` }); }
async function seedLeague(id: number) { await ctx.db.insert(leagues).values({ id, apiLigaId: 9000 + id, ligaNr: id, name: `L${id}`, seasonId: 1, seasonName: "25/26" }); }
async function seedMatch(o: { id: number; apiMatchId: number; home: number; guest: number; date: string; time: string; venueId: number | null; leagueId: number | null; matchDay: number; }) {
  await ctx.db.insert(matches).values({ id: o.id, apiMatchId: o.apiMatchId, matchNo: o.id, matchDay: o.matchDay, kickoffDate: o.date, kickoffTime: o.time, homeTeamApiId: o.home, guestTeamApiId: o.guest, venueId: o.venueId, leagueId: o.leagueId });
}

describe("reschedule-context", () => {
  it("getMatchForReschedule returns a compact match or null", async () => {
    await seedOwnTeam(100, "Dragons"); await seedOwnTeam(200, "Lions"); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    const m = await getMatchForReschedule(1);
    expect(m).toMatchObject({ matchId: 1, apiMatchId: 11, homeTeamName: "Dragons", guestTeamName: "Lions", venueId: 1, matchDay: 5 });
    expect(await getMatchForReschedule(999)).toBeNull();
  });

  it("getMatchForReschedule returns isCancelled/isForfeited as false when DB columns are null", async () => {
    await seedOwnTeam(100, "Dragons"); await seedOwnTeam(200, "Lions"); await seedVenue(1); await seedLeague(1);
    // Insert a match with explicit null for both nullable boolean columns
    await ctx.db.insert(matches).values({
      id: 2, apiMatchId: 22, matchNo: 2, matchDay: 7,
      kickoffDate: "2026-03-01", kickoffTime: "16:00:00",
      homeTeamApiId: 100, guestTeamApiId: 200,
      venueId: 1, leagueId: 1,
      isCancelled: null, isForfeited: null,
    });
    const m = await getMatchForReschedule(2);
    expect(m).not.toBeNull();
    expect(m!.isCancelled).toBe(false);
    expect(m!.isForfeited).toBe(false);
  });

  it("listClubMatches returns own-club matches in the date range", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    await seedMatch({ id: 2, apiMatchId: 12, home: 100, guest: 200, date: "2026-03-20", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 6 });
    const rows = await listClubMatches({ from: "2026-02-01", to: "2026-02-28" });
    expect(rows.map((r) => r.matchId)).toEqual([1]);
  });

  it("listVenueBookings filters by range and venue", async () => {
    await seedVenue(1);
    await ctx.db.insert(venueBookings).values({ venueId: 1, date: "2026-02-16", calculatedStartTime: "17:00:00", calculatedEndTime: "19:00:00", status: "confirmed" });
    const rows = await listVenueBookings({ from: "2026-02-01", to: "2026-02-28", venueId: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ venueId: 1, date: "2026-02-16", status: "confirmed" });
  });

  it("listVenueBookings without venueId returns all bookings in range", async () => {
    await seedVenue(1); await seedVenue(2);
    await ctx.db.insert(venueBookings).values({ venueId: 1, date: "2026-02-16", calculatedStartTime: "17:00:00", calculatedEndTime: "19:00:00", status: "confirmed" });
    await ctx.db.insert(venueBookings).values({ venueId: 2, date: "2026-02-18", calculatedStartTime: "10:00:00", calculatedEndTime: "12:00:00", status: "confirmed" });
    const rows = await listVenueBookings({ from: "2026-02-01", to: "2026-02-28" });
    expect(rows).toHaveLength(2);
  });

  it("listClubVenues lists venues", async () => {
    await seedVenue(1); await seedVenue(2);
    const v = await listClubVenues();
    expect(v.map((x) => x.venueId).sort()).toEqual([1, 2]);
  });

  it("getRoundWindow returns min/max for a league+matchDay, or null when none", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedOwnTeam(300); await seedLeague(1);
    // Three dates to exercise both branches of the reduce comparators:
    // 2026-02-14 → 2026-02-21 → 2026-02-07 forces the "b is smaller" and "a is larger" paths
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: null, leagueId: 1, matchDay: 5 });
    await seedMatch({ id: 2, apiMatchId: 12, home: 200, guest: 100, date: "2026-02-21", time: "18:00:00", venueId: null, leagueId: 1, matchDay: 5 });
    await seedMatch({ id: 3, apiMatchId: 13, home: 300, guest: 100, date: "2026-02-07", time: "18:00:00", venueId: null, leagueId: 1, matchDay: 5 });
    expect(await getRoundWindow({ leagueId: 1, matchDay: 5 })).toEqual({ from: "2026-02-07", to: "2026-02-21" });
    expect(await getRoundWindow({ leagueId: 1, matchDay: 99 })).toBeNull();
  });

  it("getRefereeContext returns current SRs or an empty note when no referee-game row", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    const r = await getRefereeContext(1);
    expect(r.slots).toEqual([]);
    expect(r.note).toContain("availability");
  });

  it("getRefereeContext returns slots when a referee-game row exists", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    await ctx.db.insert(refereeGames).values({
      apiMatchId: 11, matchId: 1, matchNo: 1,
      kickoffDate: "2026-02-14", kickoffTime: "18:00:00",
      homeTeamName: "Dragons", guestTeamName: "Lions",
      sr1OurClub: true, sr2OurClub: false,
      sr1Name: "Max Mustermann", sr2Name: null,
      sr1Status: "assigned", sr2Status: "open",
    });
    const r = await getRefereeContext(1);
    expect(r.slots).toHaveLength(2);
    expect(r.slots[0]).toMatchObject({ slot: 1, name: "Max Mustermann", status: "assigned", ourClub: true });
    expect(r.slots[1]).toMatchObject({ slot: 2, name: null, status: "open", ourClub: false });
    expect(r.note).toContain("availability");
  });
});
