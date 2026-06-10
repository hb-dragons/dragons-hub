import { describe, expect, it } from "vitest";
import {
  refereeGamesQuerySchema,
  refereeAssignBodySchema,
  refereeClaimBodySchema,
} from "./referee-self";

describe("refereeGamesQuerySchema", () => {
  it("parses empty object with defaults", () => {
    const result = refereeGamesQuerySchema.parse({});
    expect(result).toMatchObject({
      limit: 100,
      offset: 0,
      status: "active",
    });
    expect(result.search).toBeUndefined();
    expect(result.league).toBeUndefined();
    expect(result.gameType).toBeUndefined();
    expect(result.slotStatus).toBeUndefined();
  });

  it("coerces limit and offset from strings", () => {
    const result = refereeGamesQuerySchema.parse({ limit: "25", offset: "10" });
    expect(result.limit).toBe(25);
    expect(result.offset).toBe(10);
  });

  it("rejects limit below 1", () => {
    expect(() => refereeGamesQuerySchema.parse({ limit: "0" })).toThrow();
  });

  it("rejects limit above 500", () => {
    expect(() => refereeGamesQuerySchema.parse({ limit: "501" })).toThrow();
  });

  it("rejects negative offset", () => {
    expect(() => refereeGamesQuerySchema.parse({ offset: "-1" })).toThrow();
  });

  it("accepts valid status values", () => {
    for (const status of ["active", "cancelled", "forfeited", "all"] as const) {
      expect(refereeGamesQuerySchema.parse({ status }).status).toBe(status);
    }
  });

  it("rejects invalid status", () => {
    expect(() => refereeGamesQuerySchema.parse({ status: "pending" })).toThrow();
  });

  it("transforms comma-separated league into array", () => {
    const result = refereeGamesQuerySchema.parse({ league: "BezLA,BezLB" });
    expect(result.league).toEqual(["BezLA", "BezLB"]);
  });

  it("transforms single league into one-element array", () => {
    const result = refereeGamesQuerySchema.parse({ league: "BBL" });
    expect(result.league).toEqual(["BBL"]);
  });

  it("trims whitespace around league items", () => {
    const result = refereeGamesQuerySchema.parse({ league: " BBL , BezLA " });
    expect(result.league).toEqual(["BBL", "BezLA"]);
  });

  it("filters empty strings from league after split", () => {
    const result = refereeGamesQuerySchema.parse({ league: "BBL,,BezLA" });
    expect(result.league).toEqual(["BBL", "BezLA"]);
  });

  it("returns undefined league when field is absent", () => {
    const result = refereeGamesQuerySchema.parse({});
    expect(result.league).toBeUndefined();
  });

  it("accepts valid gameType values", () => {
    for (const gameType of ["home", "away", "both"] as const) {
      expect(refereeGamesQuerySchema.parse({ gameType }).gameType).toBe(gameType);
    }
  });

  it("rejects invalid gameType", () => {
    expect(() => refereeGamesQuerySchema.parse({ gameType: "neutral" })).toThrow();
  });

  it("accepts valid slotStatus values", () => {
    for (const slotStatus of ["open", "offered", "any"] as const) {
      expect(refereeGamesQuerySchema.parse({ slotStatus }).slotStatus).toBe(slotStatus);
    }
  });

  it("rejects invalid slotStatus", () => {
    expect(() => refereeGamesQuerySchema.parse({ slotStatus: "closed" })).toThrow();
  });

  it("coerces assignedRefereeApiId from string", () => {
    const result = refereeGamesQuerySchema.parse({ assignedRefereeApiId: "42" });
    expect(result.assignedRefereeApiId).toBe(42);
  });

  it("rejects non-positive assignedRefereeApiId", () => {
    expect(() => refereeGamesQuerySchema.parse({ assignedRefereeApiId: "0" })).toThrow();
  });

  it("accepts full valid object", () => {
    const result = refereeGamesQuerySchema.parse({
      limit: "10",
      offset: "5",
      search: "Berlin",
      status: "all",
      league: "BezLA,BezLB",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      gameType: "home",
      assignedRefereeApiId: "7",
      slotStatus: "open",
    });
    expect(result).toMatchObject({
      limit: 10,
      offset: 5,
      search: "Berlin",
      status: "all",
      league: ["BezLA", "BezLB"],
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      gameType: "home",
      assignedRefereeApiId: 7,
      slotStatus: "open",
    });
  });
});

describe("refereeAssignBodySchema", () => {
  it("accepts slotNumber 1 with a positive refereeApiId", () => {
    const result = refereeAssignBodySchema.parse({ slotNumber: 1, refereeApiId: 100 });
    expect(result).toEqual({ slotNumber: 1, refereeApiId: 100 });
  });

  it("accepts slotNumber 2 with a positive refereeApiId", () => {
    const result = refereeAssignBodySchema.parse({ slotNumber: 2, refereeApiId: 200 });
    expect(result).toEqual({ slotNumber: 2, refereeApiId: 200 });
  });

  it("rejects slotNumber 0", () => {
    expect(() =>
      refereeAssignBodySchema.parse({ slotNumber: 0, refereeApiId: 1 }),
    ).toThrow();
  });

  it("rejects slotNumber 3", () => {
    expect(() =>
      refereeAssignBodySchema.parse({ slotNumber: 3, refereeApiId: 1 }),
    ).toThrow();
  });

  it("rejects non-positive refereeApiId", () => {
    expect(() =>
      refereeAssignBodySchema.parse({ slotNumber: 1, refereeApiId: 0 }),
    ).toThrow();
  });

  it("rejects missing slotNumber", () => {
    expect(() => refereeAssignBodySchema.parse({ refereeApiId: 1 })).toThrow();
  });

  it("rejects missing refereeApiId", () => {
    expect(() => refereeAssignBodySchema.parse({ slotNumber: 1 })).toThrow();
  });
});

describe("refereeClaimBodySchema", () => {
  it("accepts undefined (absent body)", () => {
    const result = refereeClaimBodySchema.parse(undefined);
    expect(result).toBeUndefined();
  });

  it("accepts empty object", () => {
    const result = refereeClaimBodySchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts object with slotNumber 1", () => {
    const result = refereeClaimBodySchema.parse({ slotNumber: 1 });
    expect(result).toEqual({ slotNumber: 1 });
  });

  it("accepts object with slotNumber 2", () => {
    const result = refereeClaimBodySchema.parse({ slotNumber: 2 });
    expect(result).toEqual({ slotNumber: 2 });
  });

  it("rejects invalid slotNumber 3", () => {
    expect(() => refereeClaimBodySchema.parse({ slotNumber: 3 })).toThrow();
  });

  it("rejects invalid slotNumber 0", () => {
    expect(() => refereeClaimBodySchema.parse({ slotNumber: 0 })).toThrow();
  });
});
