import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockSelectDistinct = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    selectDistinct: (...args: unknown[]) => mockSelectDistinct(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    transaction: (cb: (tx: unknown) => unknown) => mockTransaction(cb),
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
    isOwnClub: "r.ioc",
    createdAt: "r.ca",
    updatedAt: "r.ua",
  },
  refereeRoles: { id: "rr.id", name: "rr.name" },
  matchReferees: {
    refereeId: "mr.refId",
    matchId: "mr.matchId",
    roleId: "mr.roleId",
  },
  refereeAssignmentRules: {
    id: "rar.id",
    refereeId: "rar.refId",
    teamId: "rar.teamId",
    deny: "rar.deny",
    allowSr1: "rar.sr1",
    allowSr2: "rar.sr2",
  },
  teams: { id: "t.id", name: "t.name", isOwnClub: "t.ioc" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
  ilike: vi.fn((...args: unknown[]) => ({ ilike: args })),
  asc: vi.fn((...args: unknown[]) => ({ asc: args })),
  desc: vi.fn((...args: unknown[]) => ({ desc: args })),
  sql: Object.assign(vi.fn((...args: unknown[]) => {
    const result = { sql: args, as: (alias: string) => ({ sql: args, alias }) };
    return result;
  }), { raw: vi.fn((...args: unknown[]) => ({ sql: args })) }),
  inArray: vi.fn((...args: unknown[]) => ({ inArray: args })),
}));

import {
  getReferees,
  getRefereeById,
  getRefereeCounts,
  updateRefereeVisibility,
  updateRefereeRules,
  RefereeSettingsError,
} from "./referee-admin.service";

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

describe("getReferees scope + sort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all referees when scope is 'all'", async () => {
    const rows = [
      {
        id: 1,
        apiId: 100,
        firstName: "A",
        lastName: "Z",
        licenseNumber: 1,
        allowAllHomeGames: false,
        allowAwayGames: false,
        isOwnClub: true,
        matchCount: 5,
        createdAt: makeDate("2025-01-01T00:00:00.000Z"),
        updatedAt: makeDate("2025-01-02T00:00:00.000Z"),
      },
      {
        id: 2,
        apiId: 200,
        firstName: "B",
        lastName: "Y",
        licenseNumber: 2,
        allowAllHomeGames: false,
        allowAwayGames: false,
        isOwnClub: false,
        matchCount: 3,
        createdAt: makeDate("2025-01-03T00:00:00.000Z"),
        updatedAt: makeDate("2025-01-04T00:00:00.000Z"),
      },
    ];
    const countResult = [{ count: 2 }];

    const dataChain = buildChain(rows);
    const countChain = buildChain(countResult);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    const result = await getReferees({ limit: 50, offset: 0, scope: "all" });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.items.some((r) => !r.isOwnClub)).toBe(true);
    expect(result.items[0]).not.toHaveProperty("roles");
    expect(mockSelectDistinct).not.toHaveBeenCalled();
  });

  it("filters to own-club when scope is 'own'", async () => {
    const rows = [
      {
        id: 1,
        apiId: 100,
        firstName: "A",
        lastName: "Z",
        licenseNumber: 1,
        allowAllHomeGames: false,
        allowAwayGames: false,
        isOwnClub: true,
        matchCount: 5,
        createdAt: makeDate("2025-01-01T00:00:00.000Z"),
        updatedAt: makeDate("2025-01-02T00:00:00.000Z"),
      },
    ];
    const countResult = [{ count: 1 }];

    const dataChain = buildChain(rows);
    const countChain = buildChain(countResult);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    const result = await getReferees({ limit: 50, offset: 0, scope: "own" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.isOwnClub).toBe(true);
  });

  it("orders by ascending workload when sort is 'workloadAsc'", async () => {
    const dataChain = buildChain([]);
    const countChain = buildChain([{ count: 0 }]);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    await getReferees({ limit: 50, offset: 0, scope: "own", sort: "workloadAsc" });

    // The chain's orderBy was called — verify via the chain mock
    expect(dataChain.orderBy).toHaveBeenCalled();
    const orderByArgs = (dataChain.orderBy as ReturnType<typeof vi.fn>).mock.calls[0];
    // drizzle-orm asc/desc mocks return { asc: [...] } / { desc: [...] }
    expect(JSON.stringify(orderByArgs)).toMatch(/asc/i);
  });

  it("orders by descending workload when sort is 'workloadDesc'", async () => {
    const dataChain = buildChain([]);
    const countChain = buildChain([{ count: 0 }]);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    await getReferees({ limit: 50, offset: 0, scope: "all", sort: "workloadDesc" });

    expect(dataChain.orderBy).toHaveBeenCalled();
    const orderByArgs = (dataChain.orderBy as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.stringify(orderByArgs)).toMatch(/desc/i);
  });

  it("returns empty results when total is 0", async () => {
    const dataChain = buildChain([]);
    const countChain = buildChain([{ count: 0 }]);

    mockSelect
      .mockReturnValueOnce(dataChain)
      .mockReturnValueOnce(countChain);

    const result = await getReferees({ limit: 20, offset: 0, scope: "own" });

    expect(result).toEqual({ items: [], total: 0, limit: 20, offset: 0, hasMore: false });
  });

  it("returns hasMore=true when more results exist", async () => {
    const rows = [
      {
        id: 1,
        apiId: 100,
        firstName: "A",
        lastName: "Z",
        licenseNumber: 1,
        allowAllHomeGames: false,
        allowAwayGames: false,
        isOwnClub: true,
        matchCount: 1,
        createdAt: makeDate("2025-01-01T00:00:00.000Z"),
        updatedAt: makeDate("2025-01-02T00:00:00.000Z"),
      },
    ];

    mockSelect
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain([{ count: 5 }]));

    const result = await getReferees({ limit: 1, offset: 0, scope: "all" });

    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(5);
  });

  it("defaults total to 0 when count result is empty", async () => {
    mockSelect
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]));

    const result = await getReferees({ limit: 10, offset: 0, scope: "all" });

    expect(result.total).toBe(0);
  });
});

describe("getRefereeById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a single RefereeListItem when present", async () => {
    const row = {
      id: 1,
      apiId: 100,
      firstName: "A",
      lastName: "Z",
      licenseNumber: 1,
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: true,
      matchCount: 5,
      createdAt: makeDate("2025-01-01T00:00:00.000Z"),
      updatedAt: makeDate("2025-01-02T00:00:00.000Z"),
    };

    mockSelect.mockReturnValueOnce(buildChain([row]));

    const ref = await getRefereeById(1);
    expect(ref).toMatchObject({ id: 1 });
    expect(ref).not.toHaveProperty("roles");
  });

  it("returns null when no row matches", async () => {
    mockSelect.mockReturnValueOnce(buildChain([]));

    const ref = await getRefereeById(999_999);
    expect(ref).toBeNull();
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

// --- updateRefereeSettings ---

interface TxStubConfig {
  updateReturning?: unknown[];
  selectVisibility?: unknown[];
  selectValidTeams?: unknown[];
  finalRules?: unknown[];
}

function buildTx(cfg: TxStubConfig) {
  const calls: { kind: string; args: unknown[] }[] = [];

  function selectChain(result: unknown[]) {
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "innerJoin", "where", "limit"]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.then = (resolve: (v: unknown) => void) => {
      resolve(result);
      return chain;
    };
    return chain;
  }

  function updateChain(result: unknown[]) {
    const chain: Record<string, unknown> = {};
    for (const m of ["set", "where"]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.returning = vi.fn().mockResolvedValue(result);
    return chain;
  }

  let selectCallIdx = 0;
  const selectResults = [
    cfg.selectVisibility,
    cfg.selectValidTeams,
    cfg.finalRules,
  ].filter((x): x is unknown[] => x !== undefined);

  const tx = {
    update: vi.fn((..._args) => {
      calls.push({ kind: "update", args: _args });
      return updateChain(cfg.updateReturning ?? []);
    }),
    select: vi.fn((..._args) => {
      calls.push({ kind: "select", args: _args });
      const result = selectResults[selectCallIdx] ?? [];
      selectCallIdx++;
      return selectChain(result);
    }),
    delete: vi.fn(() => {
      calls.push({ kind: "delete", args: [] });
      const chain: Record<string, unknown> = {};
      chain.where = vi.fn().mockResolvedValue(undefined);
      return chain;
    }),
    insert: vi.fn((..._args) => {
      calls.push({ kind: "insert", args: _args });
      const chain: Record<string, unknown> = {};
      chain.values = vi.fn().mockResolvedValue(undefined);
      return chain;
    }),
  };

  return { tx, calls };
}

function runTx(cfg: TxStubConfig) {
  const { tx, calls } = buildTx(cfg);
  mockTransaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));
  return { tx, calls };
}

describe("getRefereeCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns own and all counts", async () => {
    const chain = buildChain([{ own: 7, all: 42 }]);
    mockSelect.mockReturnValueOnce(chain);

    const result = await getRefereeCounts();
    expect(result).toEqual({ own: 7, all: 42 });
  });

  it("defaults to zero counts when result is empty", async () => {
    const chain = buildChain([]);
    mockSelect.mockReturnValueOnce(chain);

    const result = await getRefereeCounts();
    expect(result).toEqual({ own: 0, all: 0 });
  });
});

describe("updateRefereeRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("RefereeSettingsError is properly typed", () => {
    const err = new RefereeSettingsError("test", "NOT_OWN_CLUB");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("NOT_OWN_CLUB");
    expect(err.name).toBe("RefereeSettingsError");
  });

  it("throws NOT_FOUND when referee does not exist", async () => {
    runTx({ selectVisibility: [] });

    await expect(
      updateRefereeRules(999, { rules: [] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_OWN_CLUB when referee is not own-club", async () => {
    runTx({ selectVisibility: [{ isOwnClub: false }] });

    await expect(updateRefereeRules(1, { rules: [] })).rejects.toMatchObject({
      code: "NOT_OWN_CLUB",
    });
  });

  it("throws VALIDATION_ERROR for non-own-club team IDs", async () => {
    runTx({
      selectVisibility: [{ isOwnClub: true }],
      selectValidTeams: [],
    });

    await expect(
      updateRefereeRules(1, { rules: [{ teamId: 99, deny: false, allowSr1: true, allowSr2: false }] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("clears rules when rules array is empty", async () => {
    const { tx } = runTx({
      selectVisibility: [{ isOwnClub: true }],
      finalRules: [],
    });

    await updateRefereeRules(1, { rules: [] });

    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("upserts rules and returns them", async () => {
    const finalRules = [
      { id: 1, teamId: 10, teamName: "Team A", deny: false, allowSr1: true, allowSr2: true },
    ];
    const { tx } = runTx({
      selectVisibility: [{ isOwnClub: true }],
      selectValidTeams: [{ id: 10 }],
      finalRules,
    });

    const result = await updateRefereeRules(1, {
      rules: [{ teamId: 10, deny: false, allowSr1: true, allowSr2: true }],
    });

    expect(result).toEqual({ rules: finalRules });
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });

  it("zeros allowSr1/allowSr2 when rule.deny=true", async () => {
    const { tx } = runTx({
      selectVisibility: [{ isOwnClub: true }],
      selectValidTeams: [{ id: 10 }],
      finalRules: [],
    });

    await updateRefereeRules(1, {
      rules: [{ teamId: 10, deny: true, allowSr1: true, allowSr2: true }],
    });

    const valuesArg = (tx.insert as unknown as { mock: { results: { value: { values: ReturnType<typeof vi.fn> } }[] } })
      .mock.results[0]?.value.values;
    expect(valuesArg).toHaveBeenCalledWith([
      expect.objectContaining({ teamId: 10, deny: true, allowSr1: false, allowSr2: false }),
    ]);
  });
});
