import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock setup (must precede imports) ---

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
  };
  return { mockDb };
});

vi.mock("../../config/database", () => ({ db: mockDb }));
vi.mock("@dragons/db/schema", () => ({
  matches: {
    id: "id",
    homeTeamApiId: "homeTeamApiId",
    guestTeamApiId: "guestTeamApiId",
    kickoffDate: "kickoffDate",
    kickoffTime: "kickoffTime",
    homeScore: "homeScore",
    guestScore: "guestScore",
  },
  teams: {
    apiTeamPermanentId: "apiTeamPermanentId",
    customName: "customName",
    nameShort: "nameShort",
    name: "name",
    isOwnClub: "isOwnClub",
  },
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: (_table: unknown, _name: string) => ({
    apiTeamPermanentId: "apiTeamPermanentId",
    customName: "customName",
    nameShort: "nameShort",
    name: "name",
    isOwnClub: "isOwnClub",
  }),
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  gte: (a: unknown, b: unknown) => ({ gte: [a, b] }),
  lte: (a: unknown, b: unknown) => ({ lte: [a, b] }),
  isNotNull: (a: unknown) => ({ isNotNull: a }),
  isNull: (a: unknown) => ({ isNull: a }),
}));

// --- Imports (after mocks) ---

import { getWeekendMatches } from "./match-social.service";

// --- Helpers ---

function makeSelectChain(result: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn().mockResolvedValue(result),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Test data ---

const ownHomeTeam = {
  apiTeamPermanentId: 1,
  customName: "Herren 1",
  nameShort: "Dragons H1",
  name: "SG Dragons Hannover 1",
  isOwnClub: true,
};

const opponentTeam = {
  apiTeamPermanentId: 2,
  customName: null,
  nameShort: "TV Bergkrug",
  name: "TV Bergkrug Osnabrück",
  isOwnClub: false,
};

const ownGuestTeam = {
  apiTeamPermanentId: 3,
  customName: "Damen 1",
  nameShort: "Dragons D1",
  name: "SG Dragons Hannover Damen 1",
  isOwnClub: true,
};

const foreignHome = {
  apiTeamPermanentId: 4,
  customName: null,
  nameShort: "Rivals",
  name: "Rival Club",
  isOwnClub: false,
};

const baseMatch = {
  id: 1,
  homeTeamApiId: 1,
  guestTeamApiId: 2,
  kickoffDate: "2026-03-07",
  kickoffTime: "18:00",
  homeScore: 96,
  guestScore: 52,
};

describe("getWeekendMatches", () => {
  describe("returns SocialMatchItem[] from query rows", () => {
    it("maps a home own-club match correctly", async () => {
      const rows = [
        { match: baseMatch, homeTeam: ownHomeTeam, guestTeam: opponentTeam },
      ];
      const chain = makeSelectChain(rows);
      mockDb.select.mockReturnValue(chain);

      const result = await getWeekendMatches({ type: "results", week: 10, year: 2026 });

      expect(result).toHaveLength(1);
      const item = result[0]!;
      expect(item.id).toBe(1);
      expect(item.isHome).toBe(true);
      expect(item.teamLabel).toBe("Herren 1");
      expect(item.opponent).toBe("TV Bergkrug");
      expect(item.kickoffDate).toBe("2026-03-07");
      expect(item.kickoffTime).toBe("18:00");
      expect(item.homeScore).toBe(96);
      expect(item.guestScore).toBe(52);
    });

    it("maps an away own-club match correctly", async () => {
      const awayMatch = { ...baseMatch, homeTeamApiId: 4, guestTeamApiId: 3 };
      const rows = [
        { match: awayMatch, homeTeam: foreignHome, guestTeam: ownGuestTeam },
      ];
      const chain = makeSelectChain(rows);
      mockDb.select.mockReturnValue(chain);

      const result = await getWeekendMatches({ type: "results", week: 10, year: 2026 });

      expect(result).toHaveLength(1);
      const item = result[0]!;
      expect(item.isHome).toBe(false);
      expect(item.teamLabel).toBe("Damen 1");
      expect(item.opponent).toBe("Rivals");
    });
  });

  describe("resolveTeamLabel fallback chain", () => {
    it("uses customName when available", async () => {
      const rows = [
        { match: baseMatch, homeTeam: ownHomeTeam, guestTeam: opponentTeam },
      ];
      mockDb.select.mockReturnValue(makeSelectChain(rows));

      const result = await getWeekendMatches({ type: "results", week: 10, year: 2026 });
      expect(result[0]!.teamLabel).toBe("Herren 1");
    });

    it("falls back to nameShort when customName is null", async () => {
      const teamNoCustom = { ...ownHomeTeam, customName: null };
      const rows = [
        { match: baseMatch, homeTeam: teamNoCustom, guestTeam: opponentTeam },
      ];
      mockDb.select.mockReturnValue(makeSelectChain(rows));

      const result = await getWeekendMatches({ type: "results", week: 10, year: 2026 });
      expect(result[0]!.teamLabel).toBe("Dragons H1");
    });

    it("falls back to name when both customName and nameShort are null", async () => {
      const teamNameOnly = { ...ownHomeTeam, customName: null, nameShort: null };
      const rows = [
        { match: baseMatch, homeTeam: teamNameOnly, guestTeam: opponentTeam },
      ];
      mockDb.select.mockReturnValue(makeSelectChain(rows));

      const result = await getWeekendMatches({ type: "results", week: 10, year: 2026 });
      expect(result[0]!.teamLabel).toBe("SG Dragons Hannover 1");
    });

    it("applies fallback chain to opponent label too", async () => {
      // opponent has no customName, has nameShort
      const rows = [
        { match: baseMatch, homeTeam: ownHomeTeam, guestTeam: opponentTeam },
      ];
      mockDb.select.mockReturnValue(makeSelectChain(rows));

      const result = await getWeekendMatches({ type: "results", week: 10, year: 2026 });
      expect(result[0]!.opponent).toBe("TV Bergkrug");
    });
  });

  describe("filtering", () => {
    it("filters out rows where neither team is own club", async () => {
      const noOwnClub = {
        match: baseMatch,
        homeTeam: { ...opponentTeam, isOwnClub: false },
        guestTeam: { ...foreignHome, isOwnClub: false },
      };
      mockDb.select.mockReturnValue(makeSelectChain([noOwnClub]));

      const result = await getWeekendMatches({ type: "results", week: 10, year: 2026 });
      expect(result).toHaveLength(0);
    });

    it("includes row where only guest team is own club", async () => {
      const rows = [
        { match: baseMatch, homeTeam: foreignHome, guestTeam: ownGuestTeam },
      ];
      mockDb.select.mockReturnValue(makeSelectChain(rows));

      const result = await getWeekendMatches({ type: "results", week: 10, year: 2026 });
      expect(result).toHaveLength(1);
      expect(result[0]!.isHome).toBe(false);
    });

    it("includes row where only home team is own club", async () => {
      const rows = [
        { match: baseMatch, homeTeam: ownHomeTeam, guestTeam: opponentTeam },
      ];
      mockDb.select.mockReturnValue(makeSelectChain(rows));

      const result = await getWeekendMatches({ type: "results", week: 10, year: 2026 });
      expect(result).toHaveLength(1);
      expect(result[0]!.isHome).toBe(true);
    });

    it("returns empty array when query returns no rows", async () => {
      mockDb.select.mockReturnValue(makeSelectChain([]));

      const result = await getWeekendMatches({ type: "preview", week: 10, year: 2026 });
      expect(result).toEqual([]);
    });
  });

  describe("score fields", () => {
    it("returns null scores for preview matches", async () => {
      const previewMatch = { ...baseMatch, homeScore: null, guestScore: null };
      const rows = [
        { match: previewMatch, homeTeam: ownHomeTeam, guestTeam: opponentTeam },
      ];
      mockDb.select.mockReturnValue(makeSelectChain(rows));

      const result = await getWeekendMatches({ type: "preview", week: 10, year: 2026 });
      expect(result[0]!.homeScore).toBeNull();
      expect(result[0]!.guestScore).toBeNull();
    });

    it("returns scores for result matches", async () => {
      const rows = [
        { match: baseMatch, homeTeam: ownHomeTeam, guestTeam: opponentTeam },
      ];
      mockDb.select.mockReturnValue(makeSelectChain(rows));

      const result = await getWeekendMatches({ type: "results", week: 10, year: 2026 });
      expect(result[0]!.homeScore).toBe(96);
      expect(result[0]!.guestScore).toBe(52);
    });
  });

  describe("query construction", () => {
    it("calls db.select and chains from/innerJoin/where/orderBy", async () => {
      const chain = makeSelectChain([]);
      mockDb.select.mockReturnValue(chain);

      await getWeekendMatches({ type: "results", week: 10, year: 2026 });

      expect(mockDb.select).toHaveBeenCalledOnce();
      expect(chain.from).toHaveBeenCalledOnce();
      expect(chain.innerJoin).toHaveBeenCalledTimes(2);
      expect(chain.where).toHaveBeenCalledOnce();
      expect(chain.orderBy).toHaveBeenCalledOnce();
    });
  });
});
