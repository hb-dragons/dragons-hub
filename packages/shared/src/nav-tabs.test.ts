import { describe, it, expect } from "vitest";
import { selectTabs } from "./nav-tabs";

describe("selectTabs", () => {
  it("anonymous users get the four fan tabs", () => {
    expect(selectTabs(null)).toEqual(["home", "schedule", "standings", "teams"]);
  });
  it("a signed-in user with no surfaces gets Today but no Tools", () => {
    // role:null + no refereeId => visibleSurfaces is empty
    expect(selectTabs({ role: null })).toEqual(["home", "schedule", "today", "teams"]);
  });
  it("a referee gets Tools (officiating surface is visible)", () => {
    expect(selectTabs({ role: null, refereeId: 5 })).toEqual([
      "home",
      "schedule",
      "today",
      "teams",
      "tools",
    ]);
  });
  it("an admin gets the full signed-in set", () => {
    expect(selectTabs({ role: "admin" })).toEqual([
      "home",
      "schedule",
      "today",
      "teams",
      "tools",
    ]);
  });
});
