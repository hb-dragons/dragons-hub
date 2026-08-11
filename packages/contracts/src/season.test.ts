import { describe, it, expect } from "vitest";
import { createSeasonSchema, seasonLeaguesSchema, browseLeaguesQuerySchema } from "./season";

describe("season contracts", () => {
  it("accepts a valid create body", () => {
    expect(createSeasonSchema.safeParse({ name: "2026/27" }).success).toBe(true);
  });
  it("rejects an empty name", () => {
    expect(createSeasonSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("parses ligaIds array", () => {
    expect(seasonLeaguesSchema.safeParse({ ligaIds: [54136, 54137] }).success).toBe(true);
  });
  it("coerces vorabligaOnly query string to boolean", () => {
    const p = browseLeaguesQuerySchema.parse({ vorabligaOnly: "true" });
    expect(p.vorabligaOnly).toBe(true);
  });
  it("coerces ownClubOnly query string to boolean", () => {
    expect(browseLeaguesQuerySchema.parse({ ownClubOnly: "true" }).ownClubOnly).toBe(true);
    expect(browseLeaguesQuerySchema.parse({ ownClubOnly: "false" }).ownClubOnly).toBe(false);
    expect(browseLeaguesQuerySchema.parse({}).ownClubOnly).toBeUndefined();
  });
});
