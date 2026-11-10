import { describe, expect, it } from "vitest";
import type { TabId } from "@dragons/shared";
import { tabRootProfileAffordance } from "./viewer-chrome";

const FAN = null;
const COACH = { role: "coach" };
const REFEREE = { role: "referee", refereeId: 7 };
const ADMIN = { role: "admin" };

describe("tabRootProfileAffordance", () => {
  it.each<[TabId, ReturnType<typeof tabRootProfileAffordance>]>([
    ["home", "sign-in"],
    ["schedule", null],
    ["standings", null],
    ["teams", null],
  ])("gives a fan on %s: %s", (tab, expected) => {
    expect(tabRootProfileAffordance(FAN, tab)).toBe(expected);
  });

  it("treats an unresolved session like a fan", () => {
    expect(tabRootProfileAffordance(undefined, "home")).toBe("sign-in");
    expect(tabRootProfileAffordance(undefined, "schedule")).toBeNull();
  });

  it.each<TabId>(["home", "schedule", "standings", "teams", "today", "officiating"])(
    "gives staff their avatar on %s",
    (tab) => {
      for (const staff of [COACH, REFEREE, ADMIN]) {
        expect(tabRootProfileAffordance(staff, tab)).toBe("avatar");
      }
    },
  );
});
