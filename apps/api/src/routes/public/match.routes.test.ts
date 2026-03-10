import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getOwnClubMatches: vi.fn(),
  buildCalendarFeed: vi.fn(),
}));

vi.mock("../../services/admin/match-admin.service", () => ({
  getOwnClubMatches: mocks.getOwnClubMatches,
}));

vi.mock("../../services/public/calendar.service", () => ({
  buildCalendarFeed: mocks.buildCalendarFeed,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { publicMatchRoutes } from "./match.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", publicMatchRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /matches (public)", () => {
  it("returns 200 with match list", async () => {
    const listResult = { items: [], total: 0, limit: 1000, offset: 0, hasMore: false };
    mocks.getOwnClubMatches.mockResolvedValue(listResult);

    const res = await app.request("/matches");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(listResult);
    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(expect.objectContaining({ limit: 1000, offset: 0, sort: "asc" }));
  });

  it("returns match list with items", async () => {
    const listResult = {
      items: [
        { id: 1, homeTeamName: "Dragons", guestTeamName: "Visitors" },
        { id: 2, homeTeamName: "Away", guestTeamName: "Dragons" },
      ],
      total: 2,
      limit: 1000,
      offset: 0,
      hasMore: false,
    };
    mocks.getOwnClubMatches.mockResolvedValue(listResult);

    const res = await app.request("/matches");

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("passes query params to service", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 5, hasMore: false });

    await app.request("/matches?limit=10&offset=5&leagueId=3&dateFrom=2025-01-01&dateTo=2025-12-31");

    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(expect.objectContaining({
      limit: 10,
      offset: 5,
      leagueId: 3,
      dateFrom: "2025-01-01",
      dateTo: "2025-12-31",
      sort: "asc",
    }));
  });

  it("returns 400 for invalid date format", async () => {
    const res = await app.request("/matches?dateFrom=bad-date");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid leagueId", async () => {
    const res = await app.request("/matches?leagueId=abc");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for negative limit", async () => {
    const res = await app.request("/matches?limit=-1");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("passes sort param to service", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    await app.request("/matches?sort=desc");
    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "desc" }),
    );
  });

  it("passes hasScore param to service", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    await app.request("/matches?hasScore=true");
    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(
      expect.objectContaining({ hasScore: true }),
    );
  });

  it("passes teamApiId param to service", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    await app.request("/matches?teamApiId=42");
    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(
      expect.objectContaining({ teamApiId: 42 }),
    );
  });

  it("returns 400 for invalid sort value", async () => {
    const res = await app.request("/matches?sort=invalid");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid teamApiId", async () => {
    const res = await app.request("/matches?teamApiId=abc");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("GET /schedule.ics", () => {
  it("returns 200 with text/calendar content type", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    mocks.buildCalendarFeed.mockReturnValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR");

    const res = await app.request("/schedule.ics");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(res.headers.get("cache-control")).toBe("public, max-age=900");
  });

  it("returns ICS body from buildCalendarFeed", async () => {
    const icsBody = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR";
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    mocks.buildCalendarFeed.mockReturnValue(icsBody);

    const res = await app.request("/schedule.ics");

    expect(await res.text()).toBe(icsBody);
  });

  it("passes items to buildCalendarFeed", async () => {
    const items = [{ id: 1 }, { id: 2 }];
    mocks.getOwnClubMatches.mockResolvedValue({ items, total: 2, limit: 1000, offset: 0, hasMore: false });
    mocks.buildCalendarFeed.mockReturnValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR");

    await app.request("/schedule.ics");

    expect(mocks.buildCalendarFeed).toHaveBeenCalledWith(items, expect.objectContaining({ calendarName: "Dragons Spielplan" }));
  });

  it("passes teamApiId filter to service", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    mocks.buildCalendarFeed.mockReturnValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR");

    await app.request("/schedule.ics?teamApiId=42");

    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(expect.objectContaining({ teamApiId: 42 }));
  });

  it("passes leagueId filter to service", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    mocks.buildCalendarFeed.mockReturnValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR");

    await app.request("/schedule.ics?leagueId=5");

    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(expect.objectContaining({ leagueId: 5 }));
  });

  it("calls service with excludeInactive false", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    mocks.buildCalendarFeed.mockReturnValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR");

    await app.request("/schedule.ics");

    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(expect.objectContaining({ excludeInactive: false }));
  });

  it("uses default date window when no dates provided", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    mocks.buildCalendarFeed.mockReturnValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR");

    await app.request("/schedule.ics");

    const call = mocks.getOwnClubMatches.mock.calls[0]![0] as Record<string, string>;
    expect(call.dateFrom).toBeDefined();
    expect(call.dateTo).toBeDefined();
    // Default window: ~30 days back, ~180 days forward
    const from = new Date(call.dateFrom!);
    const to = new Date(call.dateTo!);
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(209);
    expect(diffDays).toBeLessThanOrEqual(211);
  });

  it("uses provided dateFrom/dateTo when given", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    mocks.buildCalendarFeed.mockReturnValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR");

    await app.request("/schedule.ics?dateFrom=2026-01-01&dateTo=2026-06-30");

    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(expect.objectContaining({
      dateFrom: "2026-01-01",
      dateTo: "2026-06-30",
    }));
  });

  it("returns 400 for invalid teamApiId", async () => {
    const res = await app.request("/schedule.ics?teamApiId=abc");
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const res = await app.request("/schedule.ics?dateFrom=bad");
    expect(res.status).toBe(400);
  });
});
