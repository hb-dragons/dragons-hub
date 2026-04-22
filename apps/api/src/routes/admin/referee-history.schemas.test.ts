import { describe, expect, it } from "vitest";
import {
  historyFilterSchema,
  historyGamesQuerySchema,
} from "./referee-history.schemas";

describe("historyFilterSchema status parsing", () => {
  it("defaults to empty array when omitted", () => {
    const parsed = historyFilterSchema.parse({});
    expect(parsed.status).toEqual([]);
  });

  it("parses 'all' as empty array", () => {
    const parsed = historyFilterSchema.parse({ status: "all" });
    expect(parsed.status).toEqual([]);
  });

  it("parses comma list into array", () => {
    const parsed = historyFilterSchema.parse({ status: "cancelled,forfeited" });
    expect(parsed.status).toEqual(["cancelled", "forfeited"]);
  });

  it("accepts legacy 'active' as ['played']", () => {
    const parsed = historyFilterSchema.parse({ status: "active" });
    expect(parsed.status).toEqual(["played"]);
  });

  it("rejects unknown value", () => {
    expect(() => historyFilterSchema.parse({ status: "nope" })).toThrow();
  });

  it("rejects unknown value inside list", () => {
    expect(() =>
      historyFilterSchema.parse({ status: "played,bogus" }),
    ).toThrow();
  });
});

describe("historyGamesQuerySchema refereeApiId", () => {
  it("coerces numeric string to number", () => {
    const parsed = historyGamesQuerySchema.parse({ refereeApiId: "42" });
    expect(parsed.refereeApiId).toBe(42);
  });

  it("omits refereeApiId when absent", () => {
    const parsed = historyGamesQuerySchema.parse({});
    expect(parsed.refereeApiId).toBeUndefined();
  });

  it("rejects non-integer refereeApiId", () => {
    expect(() =>
      historyGamesQuerySchema.parse({ refereeApiId: "abc" }),
    ).toThrow();
  });
});
