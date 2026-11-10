import { describe, expect, it } from "vitest";
import type { TabId } from "@dragons/shared";
import { profileGroups, tabRootProfileAffordance } from "./viewer-chrome";

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

describe("profileGroups", () => {
  // Profile reads like iOS Settings (#398): grouped rows in a fixed order.
  const LINKED_COACH = { role: "coach", personId: 12 };

  it("gives a fan sign-in on top, then App and Info", () => {
    expect(profileGroups({ user: FAN, lockSupported: true })).toEqual([
      { id: "signIn", rows: ["signIn"] },
      { id: "app", rows: ["appearance", "language"] },
      { id: "info", rows: ["privacy", "imprint", "support", "version"] },
    ]);
  });

  it("treats an unresolved session like a fan", () => {
    expect(profileGroups({ user: undefined, lockSupported: true })).toEqual(
      profileGroups({ user: FAN, lockSupported: true }),
    );
  });

  it("gives staff linked to a staff record every group, sign-out last", () => {
    expect(profileGroups({ user: LINKED_COACH, lockSupported: true })).toEqual([
      { id: "account", rows: ["contact", "notifications"] },
      { id: "app", rows: ["lock", "appearance", "language"] },
      { id: "info", rows: ["privacy", "imprint", "support", "version"] },
      { id: "session", rows: ["signOut", "deleteAccount"] },
    ]);
  });

  it.each([
    ["coach", COACH],
    ["referee", REFEREE],
    ["admin", ADMIN],
  ])("leaves contact data out for a %s with no staff record", (_name, user) => {
    expect(profileGroups({ user, lockSupported: true })[0]).toEqual({
      id: "account",
      rows: ["notifications"],
    });
  });

  it("drops the lock row on a device without biometrics", () => {
    const app = profileGroups({ user: LINKED_COACH, lockSupported: false }).find((g) => g.id === "app");
    expect(app?.rows).toEqual(["appearance", "language"]);
  });

  it("never offers a fan the lock, which guards a session they do not have", () => {
    const app = profileGroups({ user: FAN, lockSupported: true }).find((g) => g.id === "app");
    expect(app?.rows).not.toContain("lock");
  });
});
