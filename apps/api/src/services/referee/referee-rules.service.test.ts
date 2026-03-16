import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  refereeAssignmentRules: {
    id: "rar.id",
    refereeId: "rar.refereeId",
    teamId: "rar.teamId",
    allowSr1: "rar.allowSr1",
    allowSr2: "rar.allowSr2",
  },
  teams: {
    id: "t.id",
    name: "t.name",
    isOwnClub: "t.isOwnClub",
  },
  referees: {
    id: "r.id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  inArray: vi.fn((...args: unknown[]) => ({ inArray: args })),
}));

import { getRulesForReferee, updateRulesForReferee, hasAnyRules } from "./referee-rules.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRulesForReferee", () => {
  it("returns rules with team names", async () => {
    const mockRules = [
      { id: 1, teamId: 42, teamName: "Dragons 1", allowSr1: true, allowSr2: false },
    ];
    mockSelect.mockReturnValue({ from: () => ({ innerJoin: () => ({ where: () => mockRules }) }) });

    const result = await getRulesForReferee(1);
    expect(result).toEqual({ rules: mockRules });
  });

  it("returns empty rules array when referee has no rules", async () => {
    mockSelect.mockReturnValue({ from: () => ({ innerJoin: () => ({ where: () => [] }) }) });

    const result = await getRulesForReferee(999);
    expect(result).toEqual({ rules: [] });
  });
});

describe("updateRulesForReferee", () => {
  it("deletes existing rules and inserts new ones via transaction", async () => {
    const mockTxDelete = vi.fn().mockReturnValue({ where: vi.fn() });
    const mockTxInsert = vi.fn().mockReturnValue({ values: vi.fn() });
    mockTransaction.mockImplementation(async (fn) => {
      await fn({ delete: mockTxDelete, insert: mockTxInsert });
    });
    const updatedRules = [
      { id: 2, teamId: 43, teamName: "Dragons 2", allowSr1: false, allowSr2: true },
    ];
    mockSelect.mockReturnValue({ from: () => ({ innerJoin: () => ({ where: () => updatedRules }) }) });

    const result = await updateRulesForReferee(1, {
      rules: [{ teamId: 43, allowSr1: false, allowSr2: true }],
    });

    expect(mockTransaction).toHaveBeenCalled();
    expect(result).toEqual({ rules: updatedRules });
  });

  it("clears all rules when given empty array", async () => {
    const mockTxDelete = vi.fn().mockReturnValue({ where: vi.fn() });
    mockTransaction.mockImplementation(async (fn) => {
      await fn({ delete: mockTxDelete, insert: vi.fn() });
    });
    mockSelect.mockReturnValue({ from: () => ({ innerJoin: () => ({ where: () => [] }) }) });

    const result = await updateRulesForReferee(1, { rules: [] });

    expect(mockTransaction).toHaveBeenCalled();
    expect(result).toEqual({ rules: [] });
  });
});

describe("hasAnyRules", () => {
  it("returns false when no rules exist", async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => [],
        }),
      }),
    });

    const result = await hasAnyRules(1);
    expect(result).toBe(false);
  });

  it("returns true when rules exist", async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => [{ id: 1 }],
        }),
      }),
    });

    const result = await hasAnyRules(1);
    expect(result).toBe(true);
  });
});
