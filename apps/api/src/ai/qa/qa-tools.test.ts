import { describe, expect, it, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  getHomeDashboard: vi.fn(),
  getStandings: vi.fn(),
  getOwnClubMatches: vi.fn(),
}));
vi.mock("../../services/public/home-dashboard.service", () => ({ getHomeDashboard: m.getHomeDashboard }));
vi.mock("../../services/admin/standings-admin.service", () => ({ getStandings: m.getStandings }));
vi.mock("../../services/admin/match-query.service", () => ({ getOwnClubMatches: m.getOwnClubMatches }));

// --- Imports (after mocks) ---
import { qaTools } from "./qa-tools";

function byName(name: string) {
  const t = qaTools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} missing`);
  return t;
}

describe("qaTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes exactly the v1 tool set", () => {
    expect(qaTools.map((t) => t.name).sort()).toEqual(["get_dashboard", "get_standings", "list_matches"]);
  });

  it("get_dashboard calls getHomeDashboard", async () => {
    m.getHomeDashboard.mockResolvedValue({ nextGame: null });
    const r = await byName("get_dashboard").execute({});
    expect(m.getHomeDashboard).toHaveBeenCalled();
    expect(r).toEqual({ nextGame: null });
  });

  it("get_standings calls getStandings", async () => {
    m.getStandings.mockResolvedValue([]);
    await byName("get_standings").execute({});
    expect(m.getStandings).toHaveBeenCalled();
  });

  it("list_matches passes filters with defaults and returns items", async () => {
    m.getOwnClubMatches.mockResolvedValue({ items: [{ id: 1 }], total: 1, limit: 50, offset: 0, hasMore: false });
    const r = await byName("list_matches").execute({ dateFrom: "2026-06-20", dateTo: "2026-06-21" });
    expect(m.getOwnClubMatches).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: "2026-06-20", dateTo: "2026-06-21", limit: 50, offset: 0, excludeInactive: true }),
    );
    expect(r).toEqual([{ id: 1 }]);
  });

  it("list_matches rejects a malformed date", async () => {
    await expect(byName("list_matches").execute({ dateFrom: "20-06-2026" })).rejects.toThrow();
  });
});
