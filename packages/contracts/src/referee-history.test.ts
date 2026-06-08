import { describe, expect, it } from "vitest";
import {
  refereeHistoryFilterSchema,
  refereeHistoryGamesQuerySchema,
} from "./referee-history";

describe("refereeHistoryFilterSchema status parsing", () => {
  it("defaults to empty array when omitted", () => {
    const parsed = refereeHistoryFilterSchema.parse({});
    expect(parsed.status).toEqual([]);
  });

  it("parses 'all' as empty array", () => {
    const parsed = refereeHistoryFilterSchema.parse({ status: "all" });
    expect(parsed.status).toEqual([]);
  });

  it("parses comma list into array", () => {
    const parsed = refereeHistoryFilterSchema.parse({ status: "cancelled,forfeited" });
    expect(parsed.status).toEqual(["cancelled", "forfeited"]);
  });

  it("accepts legacy 'active' as ['played']", () => {
    const parsed = refereeHistoryFilterSchema.parse({ status: "active" });
    expect(parsed.status).toEqual(["played"]);
  });

  it("rejects unknown value", () => {
    expect(() => refereeHistoryFilterSchema.parse({ status: "nope" })).toThrow();
  });

  it("rejects unknown value inside list", () => {
    expect(() =>
      refereeHistoryFilterSchema.parse({ status: "played,bogus" }),
    ).toThrow();
  });
});

describe("refereeHistoryGamesQuerySchema refereeApiId", () => {
  it("coerces numeric string to number", () => {
    const parsed = refereeHistoryGamesQuerySchema.parse({ refereeApiId: "42" });
    expect(parsed.refereeApiId).toBe(42);
  });

  it("omits refereeApiId when absent", () => {
    const parsed = refereeHistoryGamesQuerySchema.parse({});
    expect(parsed.refereeApiId).toBeUndefined();
  });

  it("rejects non-integer refereeApiId", () => {
    expect(() =>
      refereeHistoryGamesQuerySchema.parse({ refereeApiId: "abc" }),
    ).toThrow();
  });
});
