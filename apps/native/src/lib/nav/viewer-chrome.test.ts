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
    expect(profileGroups({ user: FAN, lockSupported: true, os: "ios" })).toEqual([
      { id: "signIn", rows: ["signIn"] },
      { id: "app", rows: ["languageSettings"] },
      { id: "info", rows: ["privacy", "imprint", "support", "version"] },
    ]);
  });

  it("treats an unresolved session like a fan", () => {
    expect(profileGroups({ user: undefined, lockSupported: true, os: "ios" })).toEqual(
      profileGroups({ user: FAN, lockSupported: true, os: "ios" }),
    );
  });

  it("gives staff linked to a staff record every group, sign-out last", () => {
    expect(profileGroups({ user: LINKED_COACH, lockSupported: true, os: "ios" })).toEqual([
      { id: "account", rows: ["contact", "notifications"] },
      { id: "app", rows: ["lock", "languageSettings"] },
      { id: "info", rows: ["privacy", "imprint", "support", "version"] },
      { id: "session", rows: ["signOut", "deleteAccount"] },
    ]);
  });

  it.each([
    ["coach", COACH],
    ["referee", REFEREE],
    ["admin", ADMIN],
  ])("leaves contact data out for a %s with no staff record", (_name, user) => {
    expect(profileGroups({ user, lockSupported: true, os: "ios" })[0]).toEqual({
      id: "account",
      rows: ["notifications"],
    });
  });

  it("drops the lock row on a device without biometrics", () => {
    const app = profileGroups({ user: LINKED_COACH, lockSupported: false, os: "ios" }).find((g) => g.id === "app");
    expect(app?.rows).toEqual(["languageSettings"]);
  });

  it("never offers a fan the lock, which guards a session they do not have", () => {
    const app = profileGroups({ user: FAN, lockSupported: true, os: "ios" }).find((g) => g.id === "app");
    expect(app?.rows).not.toContain("lock");
  });

  // #399: the app follows the system appearance, and iOS owns the per-app
  // language; Android keeps its in-app picker.
  it.each([
    ["a fan", FAN],
    ["staff", LINKED_COACH],
  ])("never offers %s an appearance picker", (_name, user) => {
    for (const os of ["ios", "android"]) {
      const rows = profileGroups({ user, lockSupported: true, os }).flatMap((g) => g.rows);
      expect(rows).not.toContain("appearance");
    }
  });

  it.each([
    ["a fan", FAN],
    ["staff", LINKED_COACH],
  ])("sends %s on iOS to the app's page in iOS Settings for the language", (_name, user) => {
    const rows = profileGroups({ user, lockSupported: true, os: "ios" }).flatMap((g) => g.rows);
    expect(rows).toContain("languageSettings");
    expect(rows).not.toContain("language");
  });

  it.each([
    ["a fan", FAN],
    ["staff", LINKED_COACH],
  ])("keeps the in-app language picker for %s on Android", (_name, user) => {
    const rows = profileGroups({ user, lockSupported: true, os: "android" }).flatMap((g) => g.rows);
    expect(rows).toContain("language");
    expect(rows).not.toContain("languageSettings");
  });

  it("puts the lock before the language row on Android too", () => {
    const app = profileGroups({ user: LINKED_COACH, lockSupported: true, os: "android" }).find(
      (g) => g.id === "app",
    );
    expect(app?.rows).toEqual(["lock", "language"]);
  });
});
