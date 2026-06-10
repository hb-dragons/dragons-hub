import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  db: new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));

// --- Imports (after mocks) ---
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";
import { matches, teams, venues, leagues, venueBookings, venueBookingMatches } from "@dragons/db/schema";
import { verifySlot } from "./verify-slot.service";

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

describe("verifySlot", () => {
  it("returns ok with no conflicts for a free venue/date inside the round window", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    await seedMatch({ id: 2, apiMatchId: 12, home: 200, guest: 100, date: "2026-02-20", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    const res = await verifySlot({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.ok).toBe(true);
    expect(res.conflicts).toEqual([]);
  });
  it("flags venue-busy when the proposed window overlaps an existing booking", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedVenue(2); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    await seedMatch({ id: 2, apiMatchId: 12, home: 200, guest: 100, date: "2026-02-16", time: "18:00:00", venueId: 2, leagueId: 1, matchDay: 5 });
    const [b] = await ctx.db.insert(venueBookings).values({ venueId: 1, date: "2026-02-16", calculatedStartTime: "17:00:00", calculatedEndTime: "19:30:00", status: "confirmed" }).returning();
    await ctx.db.insert(venueBookingMatches).values({ venueBookingId: b!.id, matchId: 2 });
    const res = await verifySlot({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.ok).toBe(false);
    expect(res.conflicts.map((c) => c.type)).toContain("venue-busy");
  });
  it("ignores a booking that belongs to the match being moved", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    const [b] = await ctx.db.insert(venueBookings).values({ venueId: 1, date: "2026-02-16", calculatedStartTime: "17:00:00", calculatedEndTime: "19:30:00", status: "confirmed" }).returning();
    await ctx.db.insert(venueBookingMatches).values({ venueBookingId: b!.id, matchId: 1 });
    const res = await verifySlot({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.conflicts.map((c) => c.type)).not.toContain("venue-busy");
  });
  it("flags team-double-book when one of the teams already plays that day", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedOwnTeam(300); await seedVenue(1); await seedVenue(2); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    await seedMatch({ id: 2, apiMatchId: 12, home: 300, guest: 100, date: "2026-02-16", time: "12:00:00", venueId: 2, leagueId: 1, matchDay: 5 });
    const res = await verifySlot({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.ok).toBe(false);
    expect(res.conflicts.map((c) => c.type)).toContain("team-double-book");
  });
  it("flags outside-round-window as blocking when the date is past the matchday range", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    await seedMatch({ id: 2, apiMatchId: 12, home: 200, guest: 100, date: "2026-02-16", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    const res = await verifySlot({ matchId: 1, date: "2026-03-30", time: "18:00:00", venueId: 1 });
    expect(res.ok).toBe(false);
    expect(res.conflicts.map((c) => c.type)).toContain("outside-round-window");
  });
  it("returns a non-blocking round-window-unknown warning when the match has no league", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: null, matchDay: 5 });
    const res = await verifySlot({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.ok).toBe(true);
    expect(res.conflicts.map((c) => c.type)).toContain("round-window-unknown");
  });
  it("returns match-not-found (blocking) for an unknown matchId", async () => {
    const res = await verifySlot({ matchId: 999, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.ok).toBe(false);
    expect(res.conflicts.map((c) => c.type)).toContain("match-not-found");
  });

  // --- Additional coverage tests ---

  it("returns venue-not-found (blocking) when venueId does not exist", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: null, leagueId: 1, matchDay: 5 });
    const res = await verifySlot({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 9999 });
    expect(res.ok).toBe(false);
    expect(res.conflicts.map((c) => c.type)).toContain("venue-not-found");
  });

  it("does not flag outside-round-window when proposed date equals the single-match matchday date", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    // Only one match in this matchday; propose the exact same date → inside the window
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 99 });
    const res = await verifySlot({ matchId: 1, date: "2026-02-14", time: "18:00:00", venueId: 1 });
    expect(res.ok).toBe(true);
    expect(res.conflicts.map((c) => c.type)).not.toContain("outside-round-window");
  });

  it("does not flag outside-round-window when proposed date is inside the multi-match matchday window", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedOwnTeam(300); await seedOwnTeam(400);
    await seedVenue(1); await seedVenue(2); await seedVenue(3); await seedLeague(1);
    // Three matches spread across a matchday window: 2026-02-13 .. 2026-02-15
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-13", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 7 });
    await seedMatch({ id: 2, apiMatchId: 12, home: 300, guest: 400, date: "2026-02-14", time: "18:00:00", venueId: 2, leagueId: 1, matchDay: 7 });
    await seedMatch({ id: 3, apiMatchId: 13, home: 200, guest: 300, date: "2026-02-15", time: "18:00:00", venueId: 3, leagueId: 1, matchDay: 7 });
    // Propose moving match 1 to 2026-02-14 (inside window 2026-02-13..2026-02-15)
    const res = await verifySlot({ matchId: 1, date: "2026-02-14", time: "18:00:00", venueId: 1 });
    expect(res.conflicts.map((c) => c.type)).not.toContain("outside-round-window");
  });

  it("no venue-busy when proposed window does not overlap booking (booking ends before proposed starts)", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    await seedMatch({ id: 2, apiMatchId: 12, home: 200, guest: 100, date: "2026-02-12", time: "10:00:00", venueId: 1, leagueId: 1, matchDay: 4 });
    // Booking ends at 10:00, proposed window starts at ~17:00 (18:00 - 60 min buffer)
    const [b] = await ctx.db.insert(venueBookings).values({ venueId: 1, date: "2026-02-16", calculatedStartTime: "08:00:00", calculatedEndTime: "10:00:00", status: "confirmed" }).returning();
    await ctx.db.insert(venueBookingMatches).values({ venueBookingId: b!.id, matchId: 2 });
    const res = await verifySlot({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.conflicts.map((c) => c.type)).not.toContain("venue-busy");
  });

  it("uses override time window when overrideStartTime/overrideEndTime are set and overlap occurs", async () => {
    await seedOwnTeam(100); await seedOwnTeam(200); await seedVenue(1); await seedLeague(1);
    await seedMatch({ id: 1, apiMatchId: 11, home: 100, guest: 200, date: "2026-02-14", time: "18:00:00", venueId: 1, leagueId: 1, matchDay: 5 });
    await seedMatch({ id: 2, apiMatchId: 12, home: 200, guest: 100, date: "2026-02-12", time: "10:00:00", venueId: 1, leagueId: 1, matchDay: 4 });
    // Override window overlaps with proposed 18:00 slot
    const [b] = await ctx.db.insert(venueBookings).values({
      venueId: 1, date: "2026-02-16",
      calculatedStartTime: "08:00:00", calculatedEndTime: "10:00:00",
      overrideStartTime: "17:00:00", overrideEndTime: "20:00:00",
      status: "confirmed"
    }).returning();
    await ctx.db.insert(venueBookingMatches).values({ venueBookingId: b!.id, matchId: 2 });
    const res = await verifySlot({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(res.conflicts.map((c) => c.type)).toContain("venue-busy");
  });
});
