import { describe, expect, it } from "vitest";
import {
  teamIdParamSchema,
  teamReorderBodySchema,
  teamUpdateBodySchema,
} from "./team.schemas";

describe("teamIdParamSchema", () => {
  it("coerces string id to positive integer", () => {
    expect(teamIdParamSchema.parse({ id: "5" })).toEqual({ id: 5 });
  });

  it("rejects zero", () => {
    expect(() => teamIdParamSchema.parse({ id: 0 })).toThrow();
  });

  it("rejects negative numbers", () => {
    expect(() => teamIdParamSchema.parse({ id: -1 })).toThrow();
  });

  it("rejects non-numeric strings", () => {
    expect(() => teamIdParamSchema.parse({ id: "abc" })).toThrow();
  });
});

describe("teamUpdateBodySchema", () => {
  it("accepts a valid custom name", () => {
    expect(teamUpdateBodySchema.parse({ customName: "Herren 1" })).toEqual({
      customName: "Herren 1",
    });
  });

  it("accepts null to clear the custom name", () => {
    expect(teamUpdateBodySchema.parse({ customName: null })).toEqual({
      customName: null,
    });
  });

  it("rejects name exceeding 50 characters", () => {
    expect(() =>
      teamUpdateBodySchema.parse({ customName: "x".repeat(51) }),
    ).toThrow();
  });

  it("accepts name at exactly 50 characters", () => {
    const name = "x".repeat(50);
    expect(teamUpdateBodySchema.parse({ customName: name })).toEqual({
      customName: name,
    });
  });

  it("accepts empty object (no fields to update)", () => {
    expect(teamUpdateBodySchema.parse({})).toEqual({});
  });

  it("accepts estimatedGameDuration as positive integer", () => {
    expect(
      teamUpdateBodySchema.parse({ estimatedGameDuration: 90 }),
    ).toEqual({ estimatedGameDuration: 90 });
  });

  it("accepts null estimatedGameDuration", () => {
    expect(
      teamUpdateBodySchema.parse({ estimatedGameDuration: null }),
    ).toEqual({ estimatedGameDuration: null });
  });

  it("rejects zero estimatedGameDuration", () => {
    expect(() =>
      teamUpdateBodySchema.parse({ estimatedGameDuration: 0 }),
    ).toThrow();
  });

  it("rejects negative estimatedGameDuration", () => {
    expect(() =>
      teamUpdateBodySchema.parse({ estimatedGameDuration: -1 }),
    ).toThrow();
  });

  it("rejects non-integer estimatedGameDuration", () => {
    expect(() =>
      teamUpdateBodySchema.parse({ estimatedGameDuration: 90.5 }),
    ).toThrow();
  });

  it("accepts both fields together", () => {
    expect(
      teamUpdateBodySchema.parse({
        customName: "H1",
        estimatedGameDuration: 120,
      }),
    ).toEqual({ customName: "H1", estimatedGameDuration: 120 });
  });
});

describe("teamReorderBodySchema", () => {
  it("accepts a non-empty array of positive integers", () => {
    const result = teamReorderBodySchema.safeParse({ teamIds: [3, 1, 2] });
    expect(result.success).toBe(true);
  });

  it("rejects an empty array", () => {
    const result = teamReorderBodySchema.safeParse({ teamIds: [] });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive ids", () => {
    const result = teamReorderBodySchema.safeParse({ teamIds: [1, 0, 2] });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer ids", () => {
    const result = teamReorderBodySchema.safeParse({ teamIds: [1, 1.5] });
    expect(result.success).toBe(false);
  });

  it("rejects missing teamIds", () => {
    const result = teamReorderBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
