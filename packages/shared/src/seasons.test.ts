import { describe, it, expect } from "vitest";
import { SEASON_STATUSES } from "./seasons";

describe("season statuses", () => {
  it("lists the three lifecycle states in order", () => {
    expect(SEASON_STATUSES).toEqual(["upcoming", "active", "archived"]);
  });
});
