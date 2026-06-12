import { describe, it, expect } from "vitest";
import { selectTabs } from "./nav-tabs";

describe("selectTabs", () => {
  it("treats undefined like anonymous", () => {
    expect(selectTabs(undefined)).toEqual(["home", "schedule", "standings", "teams"]);
  });

  it("anonymous users get the four fan tabs", () => {
    expect(selectTabs(null)).toEqual(["home", "schedule", "standings", "teams"]);
  });

  it("a signed-in user without assignment duties keeps Standings and gains Today", () => {
    expect(selectTabs({ role: null })).toEqual([
      "home",
      "schedule",
      "standings",
      "today",
      "teams",
    ]);
  });

  it("a referee gets Officiating in place of Standings", () => {
    expect(selectTabs({ role: null, refereeId: 5 })).toEqual([
      "home",
      "schedule",
      "officiating",
      "today",
      "teams",
    ]);
  });

  it.each([["admin"], ["superadmin"], ["refereeAdmin"]])(
    "a %s gets Officiating (assignment:view)",
    (role) => {
      expect(selectTabs({ role })).toEqual([
        "home",
        "schedule",
        "officiating",
        "today",
        "teams",
      ]);
    },
  );

  it.each([["venueManager"], ["teamManager"], ["coach"]])(
    "a %s keeps Standings (no assignment view)",
    (role) => {
      expect(selectTabs({ role })).toEqual([
        "home",
        "schedule",
        "standings",
        "today",
        "teams",
      ]);
    },
  );

  it("never returns a tools tab", () => {
    for (const user of [null, { role: "admin" }, { role: null, refereeId: 1 }]) {
      expect(selectTabs(user)).not.toContain("tools");
    }
  });
});
