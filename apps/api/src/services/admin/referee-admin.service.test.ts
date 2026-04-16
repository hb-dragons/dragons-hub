import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockSelectDistinct = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    selectDistinct: (...args: unknown[]) => mockSelectDistinct(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  referees: {
    id: "r.id",
    apiId: "r.apiId",
    firstName: "r.fn",
    lastName: "r.ln",
    licenseNumber: "r.lic",
    allowAllHomeGames: "r.aahg",
    allowAwayGames: "r.aag",
    createdAt: "r.ca",
    updatedAt: "r.ua",
  },
  refereeRoles: { id: "rr.id", name: "rr.name" },
  matchReferees: {
    refereeId: "mr.refId",
    matchId: "mr.matchId",
    roleId: "mr.roleId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
  ilike: vi.fn((...args: unknown[]) => ({ ilike: args })),
  asc: vi.fn((...args: unknown[]) => ({ asc: args })),
  sql: vi.fn((...args: unknown[]) => ({ sql: args })),
}));

import { getReferees, updateRefereeVisibility } from "./referee-admin.service";

function makeDate(iso: string) {
  return { toISOString: () => iso };
}

function buildChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "leftJoin",
    "innerJoin",
    "where",
    "groupBy",
    "orderBy",
    "limit",
    "offset",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make the chain thenable so Promise.all resolves it
  chain.then = (resolve: (v: unknown) => void) => {
    resolve(result);
    return chain;
  };
  return chain;
}

describe("getReferees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns referees without search", async () => {
    const rows = [
      {
        id: 1,
        apiId: "a1",
        firstName: "Max",
        lastName: "Mustermann",
        licenseNumber: "L001",
        allowAllHomeGames: false,
        allowAwayGames: false,
        matchCount: 5,
        createdAt: makeDate("2025-01-01T00:00:00.000Z"),
        updatedAt: makeDate("2025-01-02T00:00:00.000Z"),
      },
    ];
    const countResult = [{ count: 1 }];
    const roleRows = [{ refereeId: 1, roleName: "Schiedsrichter" }];

    const dataChain = buildChain(rows);
    const countChain = buildChain(countResult);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    const roleChain = buildChain(roleRows);
    mockSelectDistinct.mockReturnValueOnce(roleChain);

    const result = await getReferees({ limit: 20, offset: 0 });

    expect(result).toEqual({
      items: [
        {
          id: 1,
          apiId: "a1",
          firstName: "Max",
          lastName: "Mustermann",
          licenseNumber: "L001",
          allowAllHomeGames: false,
          allowAwayGames: false,
          matchCount: 5,
          roles: ["Schiedsrichter"],
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-02T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    });
    expect(mockSelect).toHaveBeenCalledTimes(2);
    expect(mockSelectDistinct).toHaveBeenCalledTimes(1);
  });

  it("returns referees with search filter", async () => {
    const rows = [
      {
        id: 2,
        apiId: "a2",
        firstName: "Anna",
        lastName: "Schmidt",
        licenseNumber: "L002",
        allowAllHomeGames: false,
        allowAwayGames: false,
        matchCount: 3,
        createdAt: makeDate("2025-02-01T00:00:00.000Z"),
        updatedAt: makeDate("2025-02-02T00:00:00.000Z"),
      },
    ];
    const countResult = [{ count: 1 }];
    const roleRows = [{ refereeId: 2, roleName: "Zeitnehmer" }];

    const dataChain = buildChain(rows);
    const countChain = buildChain(countResult);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    const roleChain = buildChain(roleRows);
    mockSelectDistinct.mockReturnValueOnce(roleChain);

    const result = await getReferees({
      limit: 20,
      offset: 0,
      search: "Schmidt",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.lastName).toBe("Schmidt");
    expect(result.items[0]?.roles).toEqual(["Zeitnehmer"]);
  });

  it("returns empty results when total is 0", async () => {
    const dataChain = buildChain([]);
    const countChain = buildChain([{ count: 0 }]);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    const result = await getReferees({ limit: 20, offset: 0 });

    expect(result).toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    });
    expect(mockSelectDistinct).not.toHaveBeenCalled();
  });

  it("returns roles grouped per referee", async () => {
    const rows = [
      {
        id: 10,
        apiId: "a10",
        firstName: "Tom",
        lastName: "Bauer",
        licenseNumber: "L010",
        allowAllHomeGames: true,
        allowAwayGames: false,
        matchCount: 7,
        createdAt: makeDate("2025-03-01T00:00:00.000Z"),
        updatedAt: makeDate("2025-03-02T00:00:00.000Z"),
      },
      {
        id: 11,
        apiId: "a11",
        firstName: "Lisa",
        lastName: "Klein",
        licenseNumber: "L011",
        allowAllHomeGames: false,
        allowAwayGames: true,
        matchCount: 2,
        createdAt: makeDate("2025-03-03T00:00:00.000Z"),
        updatedAt: makeDate("2025-03-04T00:00:00.000Z"),
      },
    ];
    const countResult = [{ count: 2 }];
    const roleRows = [
      { refereeId: 10, roleName: "Schiedsrichter" },
      { refereeId: 10, roleName: "Zeitnehmer" },
      { refereeId: 11, roleName: "Anschreiber" },
    ];

    const dataChain = buildChain(rows);
    const countChain = buildChain(countResult);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    const roleChain = buildChain(roleRows);
    mockSelectDistinct.mockReturnValueOnce(roleChain);

    const result = await getReferees({ limit: 20, offset: 0 });

    expect(result.items[0]?.roles).toEqual([
      "Schiedsrichter",
      "Zeitnehmer",
    ]);
    expect(result.items[1]?.roles).toEqual(["Anschreiber"]);
  });

  it("skips role query when no referees are returned", async () => {
    const dataChain = buildChain([]);
    const countChain = buildChain([{ count: 0 }]);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    await getReferees({ limit: 10, offset: 0 });

    expect(mockSelectDistinct).not.toHaveBeenCalled();
  });

  it("returns hasMore=true when more results exist", async () => {
    const rows = [
      {
        id: 1,
        apiId: "a1",
        firstName: "Max",
        lastName: "Mustermann",
        licenseNumber: "L001",
        allowAllHomeGames: false,
        allowAwayGames: false,
        matchCount: 1,
        createdAt: makeDate("2025-01-01T00:00:00.000Z"),
        updatedAt: makeDate("2025-01-02T00:00:00.000Z"),
      },
    ];
    const countResult = [{ count: 5 }];

    const dataChain = buildChain(rows);
    const countChain = buildChain(countResult);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    const roleChain = buildChain([]);
    mockSelectDistinct.mockReturnValueOnce(roleChain);

    const result = await getReferees({ limit: 1, offset: 0 });

    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(5);
  });

  it("returns hasMore=false when at end of results", async () => {
    const rows = [
      {
        id: 1,
        apiId: "a1",
        firstName: "Max",
        lastName: "Mustermann",
        licenseNumber: "L001",
        allowAllHomeGames: false,
        allowAwayGames: false,
        matchCount: 1,
        createdAt: makeDate("2025-01-01T00:00:00.000Z"),
        updatedAt: makeDate("2025-01-02T00:00:00.000Z"),
      },
    ];
    const countResult = [{ count: 5 }];

    const dataChain = buildChain(rows);
    const countChain = buildChain(countResult);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    const roleChain = buildChain([]);
    mockSelectDistinct.mockReturnValueOnce(roleChain);

    const result = await getReferees({ limit: 2, offset: 4 });

    expect(result.hasMore).toBe(false);
  });

  it("defaults total to 0 when count result is empty", async () => {
    const dataChain = buildChain([]);
    const countChain = buildChain([]);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    const result = await getReferees({ limit: 10, offset: 0 });

    expect(result.total).toBe(0);
  });

  it("defaults total to 0 when count property is undefined", async () => {
    const dataChain = buildChain([]);
    const countChain = buildChain([{ count: undefined }]);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    const result = await getReferees({ limit: 10, offset: 0 });

    expect(result.total).toBe(0);
  });

  it("handles multiple referees where only some have roles", async () => {
    const rows = [
      {
        id: 20,
        apiId: "a20",
        firstName: "Karl",
        lastName: "Adams",
        licenseNumber: "L020",
        allowAllHomeGames: false,
        allowAwayGames: false,
        matchCount: 4,
        createdAt: makeDate("2025-05-01T00:00:00.000Z"),
        updatedAt: makeDate("2025-05-02T00:00:00.000Z"),
      },
      {
        id: 21,
        apiId: "a21",
        firstName: "Petra",
        lastName: "Berg",
        licenseNumber: "L021",
        allowAllHomeGames: false,
        allowAwayGames: false,
        matchCount: 1,
        createdAt: makeDate("2025-05-03T00:00:00.000Z"),
        updatedAt: makeDate("2025-05-04T00:00:00.000Z"),
      },
    ];
    const countResult = [{ count: 2 }];
    // Only referee 20 has roles; referee 21 has none
    const roleRows = [{ refereeId: 20, roleName: "Schiedsrichter" }];

    const dataChain = buildChain(rows);
    const countChain = buildChain(countResult);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    const roleChain = buildChain(roleRows);
    mockSelectDistinct.mockReturnValueOnce(roleChain);

    const result = await getReferees({ limit: 20, offset: 0 });

    expect(result.items[0]?.roles).toEqual(["Schiedsrichter"]);
    expect(result.items[1]?.roles).toEqual([]);
  });

  it("returns empty roles array for referee with no roles", async () => {
    const rows = [
      {
        id: 5,
        apiId: "a5",
        firstName: "Jan",
        lastName: "Weber",
        licenseNumber: "L005",
        allowAllHomeGames: false,
        allowAwayGames: false,
        matchCount: 0,
        createdAt: makeDate("2025-04-01T00:00:00.000Z"),
        updatedAt: makeDate("2025-04-02T00:00:00.000Z"),
      },
    ];
    const countResult = [{ count: 1 }];

    const dataChain = buildChain(rows);
    const countChain = buildChain(countResult);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    const roleChain = buildChain([]);
    mockSelectDistinct.mockReturnValueOnce(roleChain);

    const result = await getReferees({ limit: 10, offset: 0 });

    expect(result.items[0]?.roles).toEqual([]);
  });
});

function buildUpdateChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["set", "where"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.returning = vi.fn().mockResolvedValue(result);
  return chain;
}

describe("updateRefereeVisibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates visibility flags and returns the result", async () => {
    const updated = { id: 1, allowAllHomeGames: true, allowAwayGames: false };
    const chain = buildUpdateChain([updated]);
    mockUpdate.mockReturnValueOnce(chain);

    const result = await updateRefereeVisibility(1, {
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: false,
    });

    expect(result).toEqual(updated);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        allowAllHomeGames: true,
        allowAwayGames: false,
        isOwnClub: false,
      }),
    );
  });

  it("returns updated values when both flags are true", async () => {
    const updated = { id: 2, allowAllHomeGames: true, allowAwayGames: true };
    const chain = buildUpdateChain([updated]);
    mockUpdate.mockReturnValueOnce(chain);

    const result = await updateRefereeVisibility(2, {
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: false,
    });

    expect(result).toEqual(updated);
  });

  it("throws for non-existent referee", async () => {
    const chain = buildUpdateChain([]);
    mockUpdate.mockReturnValueOnce(chain);

    await expect(
      updateRefereeVisibility(999, {
        allowAllHomeGames: true,
        allowAwayGames: false,
        isOwnClub: false,
      }),
    ).rejects.toThrow("Referee 999 not found");
  });
});
