import { describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({
  getMatchForReschedule: vi.fn(), listClubMatches: vi.fn(), listVenueBookings: vi.fn(),
  listClubVenues: vi.fn(), getRoundWindow: vi.fn(), getRefereeContext: vi.fn(), verifySlot: vi.fn(),
}));
vi.mock("../services/reschedule/reschedule-context.service", () => ({
  getMatchForReschedule: ctx.getMatchForReschedule, listClubMatches: ctx.listClubMatches,
  listVenueBookings: ctx.listVenueBookings, listClubVenues: ctx.listClubVenues,
  getRoundWindow: ctx.getRoundWindow, getRefereeContext: ctx.getRefereeContext,
}));
vi.mock("../services/reschedule/verify-slot.service", () => ({ verifySlot: ctx.verifySlot }));

// --- Imports (after mocks) ---
import { reschedTools } from "./tool-registry";

describe("reschedTools", () => {
  it("exposes exactly the v1 read tools plus verify_slot, all with z.object input schemas", () => {
    expect(reschedTools.map((t) => t.name).sort()).toEqual(
      ["get_match", "get_referee_context", "get_round_window", "list_club_matches", "list_club_venues", "list_venue_bookings", "verify_slot"].sort(),
    );
  });

  it("verify_slot.execute validates+normalizes input and delegates to verifySlot", async () => {
    ctx.verifySlot.mockResolvedValue({ ok: true, conflicts: [] });
    const tool = reschedTools.find((t) => t.name === "verify_slot")!;
    const out = await tool.execute({ matchId: 1, date: "2026-02-16", time: "18:00", venueId: 1 });
    expect(ctx.verifySlot).toHaveBeenCalledWith({ matchId: 1, date: "2026-02-16", time: "18:00:00", venueId: 1 });
    expect(out).toEqual({ ok: true, conflicts: [] });
  });

  it("get_match.execute delegates with the parsed matchId", async () => {
    ctx.getMatchForReschedule.mockResolvedValue(null);
    const tool = reschedTools.find((t) => t.name === "get_match")!;
    await tool.execute({ matchId: 7 });
    expect(ctx.getMatchForReschedule).toHaveBeenCalledWith(7);
  });

  it("list_club_matches.execute delegates with parsed date range", async () => {
    ctx.listClubMatches.mockResolvedValue([]);
    const tool = reschedTools.find((t) => t.name === "list_club_matches")!;
    const out = await tool.execute({ from: "2026-02-01", to: "2026-02-28" });
    expect(ctx.listClubMatches).toHaveBeenCalledWith({ from: "2026-02-01", to: "2026-02-28" });
    expect(out).toEqual([]);
  });

  it("list_venue_bookings.execute delegates with parsed params (venueId optional)", async () => {
    ctx.listVenueBookings.mockResolvedValue([]);
    const tool = reschedTools.find((t) => t.name === "list_venue_bookings")!;
    await tool.execute({ from: "2026-02-01", to: "2026-02-28", venueId: 3 });
    expect(ctx.listVenueBookings).toHaveBeenCalledWith({ from: "2026-02-01", to: "2026-02-28", venueId: 3 });
  });

  it("list_club_venues.execute delegates with no args", async () => {
    ctx.listClubVenues.mockResolvedValue([{ venueId: 1, name: "Halle A", city: "Berlin" }]);
    const tool = reschedTools.find((t) => t.name === "list_club_venues")!;
    const out = await tool.execute({});
    expect(ctx.listClubVenues).toHaveBeenCalled();
    expect(out).toEqual([{ venueId: 1, name: "Halle A", city: "Berlin" }]);
  });

  it("get_round_window.execute delegates with leagueId and matchDay", async () => {
    ctx.getRoundWindow.mockResolvedValue({ from: "2026-02-14", to: "2026-02-17" });
    const tool = reschedTools.find((t) => t.name === "get_round_window")!;
    const out = await tool.execute({ leagueId: 5, matchDay: 12 });
    expect(ctx.getRoundWindow).toHaveBeenCalledWith({ leagueId: 5, matchDay: 12 });
    expect(out).toEqual({ from: "2026-02-14", to: "2026-02-17" });
  });

  it("get_referee_context.execute delegates with the parsed matchId", async () => {
    ctx.getRefereeContext.mockResolvedValue({ slots: [], note: "test" });
    const tool = reschedTools.find((t) => t.name === "get_referee_context")!;
    const out = await tool.execute({ matchId: 42 });
    expect(ctx.getRefereeContext).toHaveBeenCalledWith(42);
    expect(out).toEqual({ slots: [], note: "test" });
  });

  it("each tool exposes an inputSchema with a .shape property (for MCP adapter)", () => {
    for (const tool of reschedTools) {
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema.shape).toBe("object");
    }
  });

  it("execute rejects with a ZodError when input is invalid", async () => {
    const tool = reschedTools.find((t) => t.name === "get_match")!;
    let thrown: unknown;
    try {
      await tool.execute({ matchId: "not-a-number" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect((thrown as { issues?: unknown[] }).issues?.length).toBeGreaterThan(0);
  });
});
