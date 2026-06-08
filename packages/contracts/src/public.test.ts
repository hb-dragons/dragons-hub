import { describe, expect, it } from "vitest";
import { publicScheduleIcsQuerySchema } from "./public";

describe("publicScheduleIcsQuerySchema", () => {
  it("parses empty object (all fields optional)", () => {
    const result = publicScheduleIcsQuerySchema.parse({});
    expect(result).toEqual({});
  });

  it("coerces string teamApiId to number", () => {
    const result = publicScheduleIcsQuerySchema.parse({ teamApiId: "42" });
    expect(result).toMatchObject({ teamApiId: 42 });
  });

  it("coerces string leagueId to number", () => {
    const result = publicScheduleIcsQuerySchema.parse({ leagueId: "5" });
    expect(result).toMatchObject({ leagueId: 5 });
  });

  it("accepts valid dateFrom", () => {
    const result = publicScheduleIcsQuerySchema.parse({ dateFrom: "2026-01-15" });
    expect(result).toMatchObject({ dateFrom: "2026-01-15" });
  });

  it("accepts valid dateTo", () => {
    const result = publicScheduleIcsQuerySchema.parse({ dateTo: "2026-06-30" });
    expect(result).toMatchObject({ dateTo: "2026-06-30" });
  });

  it("accepts all fields together", () => {
    const result = publicScheduleIcsQuerySchema.parse({
      teamApiId: "7",
      leagueId: "3",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });
    expect(result).toEqual({
      teamApiId: 7,
      leagueId: 3,
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });
  });

  it("rejects invalid dateFrom format", () => {
    expect(() =>
      publicScheduleIcsQuerySchema.parse({ dateFrom: "01-15-2026" }),
    ).toThrow();
  });

  it("rejects invalid dateTo format", () => {
    expect(() =>
      publicScheduleIcsQuerySchema.parse({ dateTo: "not-a-date" }),
    ).toThrow();
  });

  it("rejects zero teamApiId", () => {
    expect(() =>
      publicScheduleIcsQuerySchema.parse({ teamApiId: "0" }),
    ).toThrow();
  });

  it("rejects negative teamApiId", () => {
    expect(() =>
      publicScheduleIcsQuerySchema.parse({ teamApiId: "-1" }),
    ).toThrow();
  });

  it("rejects non-numeric teamApiId string", () => {
    expect(() =>
      publicScheduleIcsQuerySchema.parse({ teamApiId: "abc" }),
    ).toThrow();
  });

  it("rejects zero leagueId", () => {
    expect(() =>
      publicScheduleIcsQuerySchema.parse({ leagueId: "0" }),
    ).toThrow();
  });

  it("rejects negative leagueId", () => {
    expect(() =>
      publicScheduleIcsQuerySchema.parse({ leagueId: "-5" }),
    ).toThrow();
  });
});
