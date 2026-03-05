import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ExtractedReferee, ExtractedRefereeRole, ExtractedRefereeAssignment } from "./data-fetcher";

// --- Mock setup ---

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const mockInsert = vi.fn();
const mockSelect = vi.fn();
vi.mock("../../config/database", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  referees: {
    apiId: "apiId",
    id: "id",
    dataHash: "dataHash",
    createdAt: "createdAt",
  },
  refereeRoles: {
    apiId: "apiId",
    id: "id",
    dataHash: "dataHash",
    createdAt: "createdAt",
  },
  matchReferees: {
    matchId: "matchId",
    refereeId: "refereeId",
    roleId: "roleId",
  },
  matches: {
    id: "id",
    apiMatchId: "apiMatchId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  sql: (...args: unknown[]) => args,
}));

vi.mock("./hash", () => ({
  computeEntityHash: vi.fn(() => "ref-hash"),
}));

import {
  syncRefereeRolesFromData,
  syncRefereesFromData,
  syncRefereeAssignmentsFromData,
  buildMatchIdLookup,
} from "./referees.sync";

const FROZEN_TIME = new Date("2025-06-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_TIME);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("syncRefereeRolesFromData", () => {
  it("returns empty for empty map", async () => {
    const result = await syncRefereeRolesFromData(new Map());

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.roleIdLookup.size).toBe(0);
  });

  it("creates new roles and returns lookup", async () => {
    const rolesMap = new Map<number, ExtractedRefereeRole>([
      [1, { schirirolleId: 1, schirirollename: "1. SR", schirirollekurzname: "1SR" }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 10, apiId: 1, createdAt: FROZEN_TIME }]),
        }),
      }),
    });

    const result = await syncRefereeRolesFromData(rolesMap);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.roleIdLookup.get(1)).toBe(10);
  });

  it("detects updated roles by createdAt mismatch", async () => {
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const rolesMap = new Map<number, ExtractedRefereeRole>([
      [1, { schirirolleId: 1, schirirollename: "1. SR", schirirollekurzname: "1SR" }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 10, apiId: 1, createdAt: oldDate }]),
        }),
      }),
    });

    const result = await syncRefereeRolesFromData(rolesMap);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
  });

  it("calculates skipped count when hash matches", async () => {
    const rolesMap = new Map<number, ExtractedRefereeRole>([
      [1, { schirirolleId: 1, schirirollename: "1. SR", schirirollekurzname: "1SR" }],
      [2, { schirirolleId: 2, schirirollename: "2. SR", schirirollekurzname: "2SR" }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await syncRefereeRolesFromData(rolesMap);

    expect(result.skipped).toBe(2);
  });

  it("handles batch error", async () => {
    const rolesMap = new Map<number, ExtractedRefereeRole>([
      [1, { schirirolleId: 1, schirirollename: "1. SR", schirirollekurzname: "1SR" }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("DB error")),
        }),
      }),
    });

    const result = await syncRefereeRolesFromData(rolesMap);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.roleIdLookup.size).toBe(0);
  });

  it("logs 'updated' action to logger when changes exist", async () => {
    const rolesMap = new Map<number, ExtractedRefereeRole>([
      [1, { schirirolleId: 1, schirirollename: "1. SR", schirirollekurzname: "1SR" }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 10, apiId: 1, createdAt: FROZEN_TIME }]),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncRefereeRolesFromData(rolesMap, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "refereeRole", action: "updated" }),
    );
  });

  it("logs 'skipped' action to logger when all entries skipped", async () => {
    const rolesMap = new Map<number, ExtractedRefereeRole>([
      [1, { schirirolleId: 1, schirirollename: "1. SR", schirirollekurzname: "1SR" }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncRefereeRolesFromData(rolesMap, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "refereeRole", action: "skipped" }),
    );
  });

  it("logs failure to logger", async () => {
    const rolesMap = new Map<number, ExtractedRefereeRole>([
      [1, { schirirolleId: 1, schirirollename: "1. SR", schirirollekurzname: "1SR" }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("fail")),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncRefereeRolesFromData(rolesMap, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "failed" }),
    );
  });
});

describe("syncRefereesFromData", () => {
  it("returns empty for empty map", async () => {
    const result = await syncRefereesFromData(new Map());

    expect(result.created).toBe(0);
    expect(result.refereeIdLookup.size).toBe(0);
  });

  it("creates new referees", async () => {
    const refMap = new Map<number, ExtractedReferee>([
      [1, { schiedsrichterId: 1, vorname: "John", nachname: "Doe", lizenznummer: 12345 }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 10, apiId: 1, createdAt: FROZEN_TIME }]),
        }),
      }),
    });

    const result = await syncRefereesFromData(refMap);

    expect(result.created).toBe(1);
    expect(result.refereeIdLookup.get(1)).toBe(10);
  });

  it("detects updated referees", async () => {
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const refMap = new Map<number, ExtractedReferee>([
      [1, { schiedsrichterId: 1, vorname: "John", nachname: "Doe", lizenznummer: 12345 }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 10, apiId: 1, createdAt: oldDate }]),
        }),
      }),
    });

    const result = await syncRefereesFromData(refMap);

    expect(result.updated).toBe(1);
  });

  it("calculates skipped count", async () => {
    const refMap = new Map<number, ExtractedReferee>([
      [1, { schiedsrichterId: 1, vorname: "A", nachname: "B", lizenznummer: 1 }],
      [2, { schiedsrichterId: 2, vorname: "C", nachname: "D", lizenznummer: 2 }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await syncRefereesFromData(refMap);

    expect(result.skipped).toBe(2);
  });

  it("handles batch error", async () => {
    const refMap = new Map<number, ExtractedReferee>([
      [1, { schiedsrichterId: 1, vorname: "A", nachname: "B", lizenznummer: 1 }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("fail")),
        }),
      }),
    });

    const result = await syncRefereesFromData(refMap);

    expect(result.errors).toHaveLength(1);
    expect(result.refereeIdLookup.size).toBe(0);
  });

  it("logs 'skipped' action to logger when all skipped", async () => {
    const refMap = new Map<number, ExtractedReferee>([
      [1, { schiedsrichterId: 1, vorname: "A", nachname: "B", lizenznummer: 1 }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncRefereesFromData(refMap, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "referee", action: "skipped" }),
    );
  });

  it("logs 'updated' action to logger when changes exist", async () => {
    const refMap = new Map<number, ExtractedReferee>([
      [1, { schiedsrichterId: 1, vorname: "A", nachname: "B", lizenznummer: 1 }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 10, apiId: 1, createdAt: FROZEN_TIME }]),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncRefereesFromData(refMap, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "referee", action: "updated" }),
    );
  });

  it("logs to logger on failure", async () => {
    const refMap = new Map<number, ExtractedReferee>([
      [1, { schiedsrichterId: 1, vorname: "A", nachname: "B", lizenznummer: 1 }],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("fail")),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncRefereesFromData(refMap, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "failed" }),
    );
  });
});

describe("syncRefereeAssignmentsFromData", () => {
  const refereeIdLookup = new Map([[100, 1]]);
  const roleIdLookup = new Map([[200, 2]]);
  const matchIdLookup = new Map([[300, 3]]);

  it("returns empty for empty assignments", async () => {
    const result = await syncRefereeAssignmentsFromData(
      [],
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("filters out assignments with missing FKs", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 999, schiedsrichterId: 100, schirirolleId: 200 }, // missing match
      { matchApiId: 300, schiedsrichterId: 888, schirirolleId: 200 }, // missing referee
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 777 }, // missing role
    ];

    const result = await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    expect(result.created).toBe(0);
  });

  it("creates new assignment", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200 },
    ];
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const result = await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    expect(result.created).toBe(1);
  });

  it("skips existing assignment", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200 },
    ];
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    });

    const result = await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    expect(result.created).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("handles per-assignment errors", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200 },
    ];
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error("DB error")),
        }),
      }),
    });

    const result = await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    expect(result.errors).toHaveLength(1);
  });

  it("logs created assignment to logger", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200 },
    ];
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    const mockLogger = { log: vi.fn() };

    await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
      mockLogger as never,
    );

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "created" }),
    );
  });

  it("logs failed assignment to logger", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200 },
    ];
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error("fail")),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
      mockLogger as never,
    );

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "failed" }),
    );
  });

  it("handles non-Error exception", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200 },
    ];
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue("string"),
        }),
      }),
    });

    const result = await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    expect(result.errors[0]).toContain("Unknown error");
  });
});

describe("buildMatchIdLookup", () => {
  it("returns a map from apiMatchId to id", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockResolvedValue([
        { id: 1, apiMatchId: 1000 },
        { id: 2, apiMatchId: 2000 },
      ]),
    });

    const lookup = await buildMatchIdLookup();

    expect(lookup.get(1000)).toBe(1);
    expect(lookup.get(2000)).toBe(2);
  });
});
