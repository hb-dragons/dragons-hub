import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SdkSpielfeld } from "@dragons/sdk";

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
  venues: {
    apiId: "apiId",
    id: "id",
    dataHash: "dataHash",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: (...args: unknown[]) => args,
}));

vi.mock("./hash", () => ({
  computeEntityHash: vi.fn(() => "venue-hash"),
}));

import { syncVenuesFromData, buildVenueIdLookup } from "./venues.sync";

const FROZEN_TIME = new Date("2025-06-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_TIME);
});

afterEach(() => {
  vi.useRealTimers();
});

function makeVenue(overrides: Partial<SdkSpielfeld> = {}): SdkSpielfeld {
  return {
    id: 1,
    bezeichnung: "Sports Hall",
    strasse: "Main St 1",
    plz: "12345",
    ort: "Berlin",
    kurzname: "SH",
    score: 0,
    ...overrides,
  };
}

describe("syncVenuesFromData", () => {
  it("returns early for empty map", async () => {
    const result = await syncVenuesFromData(new Map());

    expect(result.total).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("creates new venues", async () => {
    const venuesMap = new Map([[1, makeVenue()]]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1, createdAt: FROZEN_TIME }]),
        }),
      }),
    });

    const result = await syncVenuesFromData(venuesMap);

    expect(result.created).toBe(1);
    expect(result.total).toBe(1);
  });

  it("detects updated venues", async () => {
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const venuesMap = new Map([[1, makeVenue()]]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1, createdAt: oldDate }]),
        }),
      }),
    });

    const result = await syncVenuesFromData(venuesMap);

    expect(result.updated).toBe(1);
  });

  it("calculates skipped count", async () => {
    const venuesMap = new Map([
      [1, makeVenue()],
      [2, makeVenue({ id: 2 })],
    ]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await syncVenuesFromData(venuesMap);

    expect(result.skipped).toBe(2);
  });

  it("handles batch error", async () => {
    const venuesMap = new Map([[1, makeVenue()]]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("DB error")),
        }),
      }),
    });

    const result = await syncVenuesFromData(venuesMap);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Batch venue sync failed");
  });

  it("handles non-Error exception", async () => {
    const venuesMap = new Map([[1, makeVenue()]]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue("string"),
        }),
      }),
    });

    const result = await syncVenuesFromData(venuesMap);

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("uses default name when bezeichnung is empty", async () => {
    const venuesMap = new Map([[99, makeVenue({ id: 99, bezeichnung: "" })]]);
    const mockValues = vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncVenuesFromData(venuesMap);

    const records = mockValues.mock.calls[0][0];
    expect(records[0].name).toBe("Venue 99");
  });

  it("trims whitespace from bezeichnung", async () => {
    const venuesMap = new Map([[1, makeVenue({ bezeichnung: "  Hall  " })]]);
    const mockValues = vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncVenuesFromData(venuesMap);

    const records = mockValues.mock.calls[0][0];
    expect(records[0].name).toBe("Hall");
  });

  it("logs success with 'skipped' action when all entries skipped", async () => {
    const venuesMap = new Map([[1, makeVenue()]]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncVenuesFromData(venuesMap, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "venue", action: "skipped" }),
    );
  });

  it("logs success with 'updated' action when changes exist", async () => {
    const venuesMap = new Map([[1, makeVenue()]]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1, createdAt: FROZEN_TIME }]),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncVenuesFromData(venuesMap, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "venue", action: "updated" }),
    );
  });

  it("logs failure to logger", async () => {
    const venuesMap = new Map([[1, makeVenue()]]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("fail")),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncVenuesFromData(venuesMap, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "failed" }),
    );
  });

  it("includes durationMs", async () => {
    const result = await syncVenuesFromData(new Map());

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("handles null optional venue fields", async () => {
    const venuesMap = new Map([[1, makeVenue({ strasse: "", plz: "", ort: "" })]]);
    const mockValues = vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncVenuesFromData(venuesMap);

    const records = mockValues.mock.calls[0][0];
    expect(records[0].street).toBeNull();
    expect(records[0].postalCode).toBeNull();
    expect(records[0].city).toBeNull();
  });
});

describe("buildVenueIdLookup", () => {
  it("returns a map from apiId to id", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockResolvedValue([
        { id: 1, apiId: 10 },
        { id: 2, apiId: 20 },
      ]),
    });

    const lookup = await buildVenueIdLookup();

    expect(lookup.get(10)).toBe(1);
    expect(lookup.get(20)).toBe(2);
  });
});
