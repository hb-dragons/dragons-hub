import { describe, expect, it } from "vitest";
import {
  matchListQuerySchema,
  matchIdParamSchema,
  matchUpdateBodySchema,
  matchHistoryQuerySchema,
  releaseOverrideParamsSchema,
} from "./match";

describe("matchListQuerySchema", () => {
  it("parses minimal input with defaults", () => {
    const result = matchListQuerySchema.parse({});
    expect(result).toEqual({ limit: 1000, offset: 0, sort: "asc" });
  });

  it("coerces string limit and offset", () => {
    const result = matchListQuerySchema.parse({ limit: "10", offset: "5" });
    expect(result).toMatchObject({ limit: 10, offset: 5 });
  });

  it("coerces string leagueId", () => {
    const result = matchListQuerySchema.parse({ leagueId: "3" });
    expect(result).toMatchObject({ leagueId: 3 });
  });

  it("accepts valid dateFrom and dateTo", () => {
    const result = matchListQuerySchema.parse({ dateFrom: "2025-01-01", dateTo: "2025-12-31" });
    expect(result).toMatchObject({ dateFrom: "2025-01-01", dateTo: "2025-12-31" });
  });

  it("accepts sort desc", () => {
    const result = matchListQuerySchema.parse({ sort: "desc" });
    expect(result).toMatchObject({ sort: "desc" });
  });

  it("transforms hasScore true string to boolean true", () => {
    const result = matchListQuerySchema.parse({ hasScore: "true" });
    expect(result.hasScore).toBe(true);
  });

  it("transforms hasScore false string to boolean false", () => {
    const result = matchListQuerySchema.parse({ hasScore: "false" });
    expect(result.hasScore).toBe(false);
  });

  it("coerces teamApiId to number", () => {
    const result = matchListQuerySchema.parse({ teamApiId: "42" });
    expect(result).toMatchObject({ teamApiId: 42 });
  });

  it("rejects invalid dateFrom format", () => {
    expect(() => matchListQuerySchema.parse({ dateFrom: "01-01-2025" })).toThrow();
  });

  it("rejects limit below 1", () => {
    expect(() => matchListQuerySchema.parse({ limit: "0" })).toThrow();
  });

  it("rejects limit above 1000", () => {
    expect(() => matchListQuerySchema.parse({ limit: "1001" })).toThrow();
  });

  it("rejects negative offset", () => {
    expect(() => matchListQuerySchema.parse({ offset: "-1" })).toThrow();
  });

  it("rejects invalid sort value", () => {
    expect(() => matchListQuerySchema.parse({ sort: "random" })).toThrow();
  });

  it("rejects invalid hasScore value", () => {
    expect(() => matchListQuerySchema.parse({ hasScore: "yes" })).toThrow();
  });

  it("rejects negative leagueId", () => {
    expect(() => matchListQuerySchema.parse({ leagueId: "-1" })).toThrow();
  });

  it("rejects non-numeric leagueId string", () => {
    expect(() => matchListQuerySchema.parse({ leagueId: "abc" })).toThrow();
  });
});

describe("matchIdParamSchema", () => {
  it("coerces string id to positive integer", () => {
    expect(matchIdParamSchema.parse({ id: "5" })).toEqual({ id: 5 });
  });

  it("accepts numeric id directly", () => {
    expect(matchIdParamSchema.parse({ id: 10 })).toEqual({ id: 10 });
  });

  it("rejects zero", () => {
    expect(() => matchIdParamSchema.parse({ id: 0 })).toThrow();
  });

  it("rejects negative id", () => {
    expect(() => matchIdParamSchema.parse({ id: -1 })).toThrow();
  });

  it("rejects non-numeric string", () => {
    expect(() => matchIdParamSchema.parse({ id: "abc" })).toThrow();
  });
});

describe("matchUpdateBodySchema", () => {
  it("accepts empty object", () => {
    expect(matchUpdateBodySchema.parse({})).toEqual({});
  });

  it("accepts valid kickoffDate", () => {
    const result = matchUpdateBodySchema.parse({ kickoffDate: "2025-04-01" });
    expect(result).toMatchObject({ kickoffDate: "2025-04-01" });
  });

  it("accepts null kickoffDate to clear override", () => {
    const result = matchUpdateBodySchema.parse({ kickoffDate: null });
    expect(result).toMatchObject({ kickoffDate: null });
  });

  it("accepts valid kickoffTime", () => {
    const result = matchUpdateBodySchema.parse({ kickoffTime: "18:00" });
    expect(result).toMatchObject({ kickoffTime: "18:00" });
  });

  it("accepts boolean isForfeited and isCancelled", () => {
    const result = matchUpdateBodySchema.parse({ isForfeited: true, isCancelled: false });
    expect(result).toMatchObject({ isForfeited: true, isCancelled: false });
  });

  it("accepts venueNameOverride", () => {
    const result = matchUpdateBodySchema.parse({ venueNameOverride: "Gymnasium Nord" });
    expect(result).toMatchObject({ venueNameOverride: "Gymnasium Nord" });
  });

  it("accepts score fields", () => {
    const result = matchUpdateBodySchema.parse({ homeScore: 85, guestScore: 72 });
    expect(result).toMatchObject({ homeScore: 85, guestScore: 72 });
  });

  it("accepts null score to clear", () => {
    const result = matchUpdateBodySchema.parse({ homeScore: null });
    expect(result).toMatchObject({ homeScore: null });
  });

  it("accepts quarter scores", () => {
    const result = matchUpdateBodySchema.parse({ homeQ1: 20, guestQ1: 18, homeQ2: 22, guestQ2: 20 });
    expect(result).toMatchObject({ homeQ1: 20, guestQ1: 18 });
  });

  it("accepts overtime scores", () => {
    const result = matchUpdateBodySchema.parse({ homeOt1: 5, guestOt1: 3 });
    expect(result).toMatchObject({ homeOt1: 5, guestOt1: 3 });
  });

  it("accepts changeReason", () => {
    const result = matchUpdateBodySchema.parse({ changeReason: "Rescheduled" });
    expect(result).toMatchObject({ changeReason: "Rescheduled" });
  });

  it("accepts venueId as positive integer", () => {
    const result = matchUpdateBodySchema.parse({ venueId: 7 });
    expect(result).toMatchObject({ venueId: 7 });
  });

  it("accepts null venueId", () => {
    const result = matchUpdateBodySchema.parse({ venueId: null });
    expect(result).toMatchObject({ venueId: null });
  });

  it("rejects invalid kickoffDate format", () => {
    expect(() => matchUpdateBodySchema.parse({ kickoffDate: "not-a-date" })).toThrow();
  });

  it("rejects invalid kickoffTime format", () => {
    expect(() => matchUpdateBodySchema.parse({ kickoffTime: "not-a-time" })).toThrow();
  });

  it("rejects venueNameOverride exceeding 200 characters", () => {
    expect(() =>
      matchUpdateBodySchema.parse({ venueNameOverride: "x".repeat(201) }),
    ).toThrow();
  });

  it("rejects internalNotes exceeding 2000 characters", () => {
    expect(() =>
      matchUpdateBodySchema.parse({ internalNotes: "x".repeat(2001) }),
    ).toThrow();
  });

  it("rejects negative venueId", () => {
    expect(() => matchUpdateBodySchema.parse({ venueId: -1 })).toThrow();
  });
});

describe("matchHistoryQuerySchema", () => {
  it("parses minimal input with defaults", () => {
    const result = matchHistoryQuerySchema.parse({});
    expect(result).toEqual({ limit: 50, offset: 0 });
  });

  it("coerces string limit and offset", () => {
    const result = matchHistoryQuerySchema.parse({ limit: "10", offset: "5" });
    expect(result).toEqual({ limit: 10, offset: 5 });
  });

  it("accepts limit at max boundary", () => {
    const result = matchHistoryQuerySchema.parse({ limit: "200" });
    expect(result).toMatchObject({ limit: 200 });
  });

  it("rejects limit above 200", () => {
    expect(() => matchHistoryQuerySchema.parse({ limit: "201" })).toThrow();
  });

  it("rejects limit below 1", () => {
    expect(() => matchHistoryQuerySchema.parse({ limit: "0" })).toThrow();
  });

  it("rejects negative offset", () => {
    expect(() => matchHistoryQuerySchema.parse({ offset: "-1" })).toThrow();
  });
});

describe("releaseOverrideParamsSchema", () => {
  it("accepts valid id and fieldName", () => {
    const result = releaseOverrideParamsSchema.parse({ id: "1", fieldName: "kickoffDate" });
    expect(result).toEqual({ id: 1, fieldName: "kickoffDate" });
  });

  it("coerces string id to number", () => {
    const result = releaseOverrideParamsSchema.parse({ id: "42", fieldName: "homeScore" });
    expect(result).toMatchObject({ id: 42 });
  });

  it("accepts fieldName at max length", () => {
    const fieldName = "x".repeat(100);
    const result = releaseOverrideParamsSchema.parse({ id: "1", fieldName });
    expect(result).toMatchObject({ fieldName });
  });

  it("rejects zero id", () => {
    expect(() => releaseOverrideParamsSchema.parse({ id: 0, fieldName: "homeScore" })).toThrow();
  });

  it("rejects negative id", () => {
    expect(() => releaseOverrideParamsSchema.parse({ id: -1, fieldName: "homeScore" })).toThrow();
  });

  it("rejects non-numeric id string", () => {
    expect(() => releaseOverrideParamsSchema.parse({ id: "abc", fieldName: "homeScore" })).toThrow();
  });

  it("rejects empty fieldName", () => {
    expect(() => releaseOverrideParamsSchema.parse({ id: 1, fieldName: "" })).toThrow();
  });

  it("rejects fieldName exceeding 100 characters", () => {
    expect(() =>
      releaseOverrideParamsSchema.parse({ id: 1, fieldName: "x".repeat(101) }),
    ).toThrow();
  });
});
