import { describe, it, expect } from "vitest";
import { standingsListQuerySchema } from "./standings";

describe("standingsListQuerySchema", () => {
  it("accepts an absent seasonId — the route then defaults to the active season", () => {
    expect(standingsListQuerySchema.parse({})).toEqual({});
  });

  it("coerces seasonId from the query string", () => {
    expect(standingsListQuerySchema.parse({ seasonId: "7" })).toEqual({ seasonId: 7 });
  });

  it("rejects a non-positive or non-integer seasonId", () => {
    expect(standingsListQuerySchema.safeParse({ seasonId: "0" }).success).toBe(false);
    expect(standingsListQuerySchema.safeParse({ seasonId: "-1" }).success).toBe(false);
    expect(standingsListQuerySchema.safeParse({ seasonId: "1.5" }).success).toBe(false);
    expect(standingsListQuerySchema.safeParse({ seasonId: "abc" }).success).toBe(false);
  });
});
