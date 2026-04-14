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
const mockUpdate = vi.fn();
const mockExecute = vi.fn();
vi.mock("../../config/database", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

const mockPublishDomainEvent = vi.fn().mockResolvedValue({ id: "mock-event-id" });
vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: (...args: unknown[]) => mockPublishDomainEvent(...args),
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
    id: "mr.id",
    matchId: "matchId",
    refereeId: "refereeId",
    roleId: "roleId",
    slotNumber: "slotNumber",
  },
  matches: {
    id: "id",
    apiMatchId: "apiMatchId",
  },
  refereeAssignmentIntents: {
    id: "id",
    matchId: "matchId",
    refereeId: "refereeId",
    confirmedBySyncAt: "confirmedBySyncAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  inArray: vi.fn((...args: unknown[]) => ({ inArray: args })),
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
  confirmIntentsFromSync,
} from "./referees.sync";

const FROZEN_TIME = new Date("2025-06-01T00:00:00Z");

function buildSelectChain(result: unknown) {
  const thenableResult = {
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue(result),
    }),
    then: (resolve: (v: unknown) => void) => {
      resolve(result);
      return thenableResult;
    },
  };
  return {
    from: vi.fn().mockReturnValue(thenableResult),
  };
}

function buildBatchSelectChain(result: unknown) {
  const whereResult = {
    then: (resolve: (v: unknown) => void) => {
      resolve(result);
      return whereResult;
    },
  };
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereResult),
    }),
  };
}

/**
 * Set up mock select calls for the batch-loaded lookup maps
 * used by syncRefereeAssignmentsFromData for event emission.
 * Call after setting up the existing-assignments batch select mock.
 */
function mockBatchLookups() {
  // referee names batch
  mockSelect.mockReturnValueOnce(buildBatchSelectChain([
    { id: 1, firstName: "John", lastName: "Doe" },
  ]));
  // match info batch
  mockSelect.mockReturnValueOnce(buildBatchSelectChain([
    { id: 3, matchNo: 1, homeTeamApiId: 100, guestTeamApiId: 200 },
  ]));
  // role names batch
  mockSelect.mockReturnValueOnce(buildBatchSelectChain([
    { id: 2, name: "SR1" },
  ]));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_TIME);
  // Default: mockSelect returns empty array (for pre-load queries before upsert)
  mockSelect.mockReturnValue(buildSelectChain([]));
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
    // Pre-load returns existing roles before upsert
    mockSelect.mockReturnValue(buildSelectChain([{ id: 10, apiId: 1 }]));

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
    // Pre-load returns existing referees before upsert
    mockSelect.mockReturnValue(buildSelectChain([{ id: 10, apiId: 1 }]));

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
      { matchApiId: 999, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 }, // missing match
      { matchApiId: 300, schiedsrichterId: 888, schirirolleId: 200, slotNumber: 1 }, // missing referee
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 777, slotNumber: 1 }, // missing role
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
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    // Batch-load returns no existing assignments
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    mockBatchLookups();
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

  it("skips existing assignment with same referee and role", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    // Batch-load returns existing assignment with same refereeId and roleId
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 1, matchId: 3, slotNumber: 1, refereeId: 1, roleId: 2 },
    ]));
    mockBatchLookups();

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
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    // Batch-load returns no existing assignments
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    mockBatchLookups();
    // Insert fails
    mockInsert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("DB error")),
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
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    // Batch-load returns no existing assignments
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    mockBatchLookups();
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
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    // Batch-load returns no existing assignments
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    mockBatchLookups();
    // Insert fails
    mockInsert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("fail")),
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
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    // Batch-load returns no existing assignments
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    mockBatchLookups();
    // Insert fails with non-Error
    mockInsert.mockReturnValue({
      values: vi.fn().mockRejectedValue("string"),
    });

    const result = await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("updates existing assignment when referee or role changed", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    // Batch-load returns existing assignment with different refereeId
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 5, matchId: 3, slotNumber: 1, refereeId: 99, roleId: 2 },
    ]));
    mockBatchLookups();
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    expect(result.created).toBe(0);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("emits referee.assigned event with correct payload and syncRunId", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    mockBatchLookups();
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
      undefined,
      42,
    );

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "referee.assigned",
        source: "sync",
        entityType: "referee",
        entityId: 3,
        syncRunId: 42,
        payload: expect.objectContaining({
          refereeName: "John Doe",
          refereeId: 1,
          teamIds: [100, 200],
          role: "SR1",
        }),
      }),
    );
  });

  it("emits referee.reassigned event with syncRunId when referee changed", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    // Existing assignment has different referee (id: 99)
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 5, matchId: 3, slotNumber: 1, refereeId: 99, roleId: 2 },
    ]));
    // Batch lookups need to include both old (99) and new (1) referee
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 1, firstName: "John", lastName: "Doe" },
      { id: 99, firstName: "Old", lastName: "Ref" },
    ]));
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 3, matchNo: 1, homeTeamApiId: 100, guestTeamApiId: 200 },
    ]));
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 2, name: "SR1" },
    ]));
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
      undefined,
      99,
    );

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "referee.reassigned",
        source: "sync",
        syncRunId: 99,
        payload: expect.objectContaining({
          oldRefereeName: "Old Ref",
          newRefereeName: "John Doe",
          oldRefereeId: 99,
          newRefereeId: 1,
        }),
      }),
    );
  });

  it("passes null syncRunId when not provided", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    mockBatchLookups();
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        syncRunId: null,
      }),
    );
  });

  it("logs warning when publishDomainEvent throws during referee.assigned", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    mockBatchLookups();
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockPublishDomainEvent.mockRejectedValueOnce(new Error("publish failed"));

    const result = await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    // Assignment still created despite event emission failure
    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("logs warning when publishDomainEvent throws during referee.reassigned", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    // Existing assignment has different referee (id: 99)
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 5, matchId: 3, slotNumber: 1, refereeId: 99, roleId: 2 },
    ]));
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 1, firstName: "John", lastName: "Doe" },
      { id: 99, firstName: "Old", lastName: "Ref" },
    ]));
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 3, matchNo: 1, homeTeamApiId: 100, guestTeamApiId: 200 },
    ]));
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 2, name: "SR1" },
    ]));
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    mockPublishDomainEvent.mockRejectedValueOnce(new Error("publish failed"));

    const result = await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    // Update still succeeds despite event emission failure
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("batch-loads existing assignments and lookup data before processing loop", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 2 },
    ];
    // Batch-load returns one existing assignment
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 1, matchId: 3, slotNumber: 1, refereeId: 1, roleId: 2 },
    ]));
    // Batch lookup maps for event emission
    mockBatchLookups();
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const result = await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    // 1 existing assignments + 3 batch lookups (referees, matches, roles)
    expect(mockSelect).toHaveBeenCalledTimes(4);
    // Slot 1 exists, slot 2 is new
    expect(result.created).toBe(1);
  });

  it("skips event emission when match info is not found in batch lookup", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    // Batch-load returns no existing assignments
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    // referee names batch — has the referee
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 1, firstName: "John", lastName: "Doe" },
    ]));
    // match info batch — empty, so matchInfoMap.get(matchId) returns undefined
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    // role names batch
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 2, name: "SR1" },
    ]));
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const result = await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    // Assignment is still created
    expect(result.created).toBe(1);
    // But no event is published because matchInfo was not found
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("uses 'Unknown' fallback when referee not found in batch lookup", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    // referee names batch — empty, so refNameMap.get(refereeId) returns undefined -> "Unknown"
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    // match info batch — has the match
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 3, matchNo: 1, homeTeamApiId: 100, guestTeamApiId: 200 },
    ]));
    // role names batch
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 2, name: "SR1" },
    ]));
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          refereeName: "Unknown",
        }),
      }),
    );
  });

  it("uses 'Unknown' fallback when role not found in batch lookup", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    // referee names batch
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 1, firstName: "John", lastName: "Doe" },
    ]));
    // match info batch
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 3, matchNo: 1, homeTeamApiId: 100, guestTeamApiId: 200 },
    ]));
    // role names batch — empty, so roleNameMap.get(roleId) returns undefined -> "Unknown"
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          role: "Unknown",
        }),
      }),
    );
  });

  it("skips reassigned event emission when match info is not found", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    // Existing assignment has different referee
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 5, matchId: 3, slotNumber: 1, refereeId: 99, roleId: 2 },
    ]));
    // referee names batch
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 1, firstName: "John", lastName: "Doe" },
      { id: 99, firstName: "Old", lastName: "Ref" },
    ]));
    // match info batch — empty
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    // role names batch
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 2, name: "SR1" },
    ]));
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    // Update still happens
    expect(mockUpdate).toHaveBeenCalled();
    // But no event is published because matchInfo was not found
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(0);
  });

  it("uses 'Unknown' fallbacks for referee names and role in reassigned event", async () => {
    const assignments: ExtractedRefereeAssignment[] = [
      { matchApiId: 300, schiedsrichterId: 100, schirirolleId: 200, slotNumber: 1 },
    ];
    // Existing assignment has different referee
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 5, matchId: 3, slotNumber: 1, refereeId: 99, roleId: 2 },
    ]));
    // referee names batch — empty (both old and new referee missing)
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    // match info batch
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([
      { id: 3, matchNo: 1, homeTeamApiId: 100, guestTeamApiId: 200 },
    ]));
    // role names batch — empty
    mockSelect.mockReturnValueOnce(buildBatchSelectChain([]));
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await syncRefereeAssignmentsFromData(
      assignments,
      refereeIdLookup,
      roleIdLookup,
      matchIdLookup,
    );

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "referee.reassigned",
        payload: expect.objectContaining({
          oldRefereeName: "Unknown",
          newRefereeName: "Unknown",
          role: "Unknown",
        }),
      }),
    );
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

describe("confirmIntentsFromSync", () => {
  it("confirms intents with matching assignments", async () => {
    mockExecute.mockResolvedValue({ rowCount: 3 });

    const result = await confirmIntentsFromSync();

    expect(result).toBe(3);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when no intents match", async () => {
    mockExecute.mockResolvedValue({ rowCount: 0 });

    const result = await confirmIntentsFromSync();

    expect(result).toBe(0);
  });

  it("handles null rowCount", async () => {
    mockExecute.mockResolvedValue({});

    const result = await confirmIntentsFromSync();

    expect(result).toBe(0);
  });

  it("handles undefined rowCount", async () => {
    mockExecute.mockResolvedValue({ rowCount: undefined });

    const result = await confirmIntentsFromSync();

    expect(result).toBe(0);
  });
});
