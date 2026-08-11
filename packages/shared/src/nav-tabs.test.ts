import { describe, it, expect } from "vitest";
import type { GateUser } from "./rbac";
import { needsStandingsShortcut, selectTabs } from "./nav-tabs";

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

describe("needsStandingsShortcut", () => {
  const USERS: GateUser[] = [
    undefined,
    null,
    { role: null },
    { role: null, refereeId: 5 },
    { role: "admin" },
    { role: "superadmin" },
    { role: "refereeAdmin" },
    { role: "venueManager" },
    { role: "teamManager" },
    { role: "coach" },
  ];

  it("is true exactly when the user's tab set has no Standings tab", () => {
    for (const user of USERS) {
      expect(needsStandingsShortcut(user), JSON.stringify(user)).toBe(
        !selectTabs(user).includes("standings"),
      );
    }
  });

  it("leaves anonymous Fans without a shortcut — they have the tab", () => {
    expect(needsStandingsShortcut(null)).toBe(false);
    expect(needsStandingsShortcut(undefined)).toBe(false);
  });

  it.each([["admin"], ["superadmin"], ["refereeAdmin"]])(
    "gives a %s the shortcut, since Officiating took the Standings slot",
    (role) => {
      expect(needsStandingsShortcut({ role })).toBe(true);
    },
  );

  it("gives a referee the shortcut", () => {
    expect(needsStandingsShortcut({ role: null, refereeId: 5 })).toBe(true);
  });

  it.each([["venueManager"], ["teamManager"], ["coach"]])(
    "leaves a %s without a shortcut — they keep the Standings tab",
    (role) => {
      expect(needsStandingsShortcut({ role })).toBe(false);
    },
  );
});
