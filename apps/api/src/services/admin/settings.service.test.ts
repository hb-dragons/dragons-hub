import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

const mockSelect = vi.fn();
const mockInsert = vi.fn();
vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  appSettings: {
    key: "key",
    value: "value",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
}));

import { getSetting, upsertSetting, getClubConfig, setClubConfig } from "./settings.service";

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Helpers ---

function mockSelectReturning(value: string | null) {
  const row = value !== null ? { value } : undefined;
  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(row ? [row] : []),
      }),
    }),
  });
}

function mockInsertSuccess() {
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

describe("getSetting", () => {
  it("returns value when setting exists", async () => {
    mockSelectReturning("4121");

    const result = await getSetting("club_id");

    expect(result).toBe("4121");
  });

  it("returns null when setting does not exist", async () => {
    mockSelectReturning(null);

    const result = await getSetting("nonexistent");

    expect(result).toBeNull();
  });
});

describe("upsertSetting", () => {
  it("inserts or updates a setting", async () => {
    mockInsertSuccess();

    await upsertSetting("club_id", "4121");

    expect(mockInsert).toHaveBeenCalled();
  });
});

describe("getClubConfig", () => {
  it("returns club config when both settings exist", async () => {
    let callIndex = 0;
    mockSelect.mockImplementation(() => {
      const values = [{ value: "4121" }, { value: "Dragons" }];
      const row = values[callIndex++];
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(row ? [row] : []),
          }),
        }),
      };
    });

    const result = await getClubConfig();

    expect(result).toEqual({ clubId: 4121, clubName: "Dragons" });
  });

  it("returns null when club_id is not set", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await getClubConfig();

    expect(result).toBeNull();
  });

  it("returns empty club name when only club_id is set", async () => {
    let callIndex = 0;
    mockSelect.mockImplementation(() => {
      const values = [{ value: "4121" }, undefined];
      const row = values[callIndex++];
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(row ? [row] : []),
          }),
        }),
      };
    });

    const result = await getClubConfig();

    expect(result).toEqual({ clubId: 4121, clubName: "" });
  });
});

describe("setClubConfig", () => {
  it("upserts both club_id and club_name", async () => {
    mockInsertSuccess();

    await setClubConfig(4121, "Dragons");

    expect(mockInsert).toHaveBeenCalledTimes(2);
  });
});
