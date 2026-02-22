import { describe, expect, it } from "vitest";
import { teamIdParamSchema, teamUpdateBodySchema } from "./team.schemas";

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

  it("rejects missing customName field", () => {
    expect(() => teamUpdateBodySchema.parse({})).toThrow();
  });
});
