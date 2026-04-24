import { describe, expect, it } from "vitest";
import {
  ROLE_NAMES,
  can,
  canAll,
  canViewOpenGames,
  hasRole,
  isReferee,
  parseRoles,
  type RoleName,
} from "./rbac";

describe("parseRoles", () => {
  it("returns empty array for null, undefined, empty string", () => {
    expect(parseRoles(null)).toEqual([]);
    expect(parseRoles(undefined)).toEqual([]);
    expect(parseRoles("")).toEqual([]);
  });

  it("returns single role", () => {
    expect(parseRoles("admin")).toEqual(["admin"]);
  });

  it("returns multiple roles, trimming whitespace", () => {
    expect(parseRoles("admin, refereeAdmin , venueManager")).toEqual([
      "admin",
      "refereeAdmin",
      "venueManager",
    ]);
  });

  it("filters out unknown role names", () => {
    expect(parseRoles("admin,notARealRole,refereeAdmin")).toEqual([
      "admin",
      "refereeAdmin",
    ]);
  });

  it("tolerates stray commas", () => {
    expect(parseRoles("admin,,refereeAdmin,")).toEqual(["admin", "refereeAdmin"]);
  });
});

describe("can", () => {
  const cases: Array<[RoleName, string, string, boolean]> = [
    ["admin", "referee", "delete", true],
    ["admin", "venue", "delete", true],
    ["admin", "settings", "update", true],
    ["refereeAdmin", "referee", "delete", true],
    ["refereeAdmin", "assignment", "claim", true],
    ["refereeAdmin", "match", "view", true],
    ["refereeAdmin", "match", "update", false],
    ["refereeAdmin", "team", "view", true],
    ["refereeAdmin", "team", "manage", false],
    ["refereeAdmin", "sync", "view", false],
    ["refereeAdmin", "sync", "trigger", false],
    ["refereeAdmin", "venue", "view", false],
    ["venueManager", "venue", "create", true],
    ["venueManager", "booking", "delete", true],
    ["venueManager", "referee", "view", false],
    ["venueManager", "match", "view", true],
    ["teamManager", "team", "manage", true],
    ["teamManager", "standing", "view", true],
    ["teamManager", "referee", "view", true],
    ["teamManager", "referee", "update", false],
    ["teamManager", "venue", "view", false],
    // board resource
    ["admin", "board", "view", true],
    ["admin", "board", "create", true],
    ["admin", "board", "update", true],
    ["admin", "board", "delete", true],
    ["refereeAdmin", "board", "view", true],
    ["refereeAdmin", "board", "create", true],
    ["refereeAdmin", "board", "update", true],
    ["refereeAdmin", "board", "delete", false],
    ["venueManager", "board", "view", true],
    ["venueManager", "board", "create", true],
    ["venueManager", "board", "update", true],
    ["venueManager", "board", "delete", false],
    ["teamManager", "board", "view", true],
    ["teamManager", "board", "create", true],
    ["teamManager", "board", "update", true],
    ["teamManager", "board", "delete", false],
  ];
  for (const [role, resource, action, expected] of cases) {
    it(`${role} ${expected ? "CAN" : "CANNOT"} ${action} on ${resource}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(can({ role } as any, resource as any, action as any)).toBe(expected);
    });
  }

  it("returns false for null/undefined user", () => {
    expect(can(null, "referee", "view")).toBe(false);
    expect(can(undefined, "referee", "view")).toBe(false);
  });

  it("returns false for user with no role", () => {
    expect(can({ role: null }, "referee", "view")).toBe(false);
    expect(can({ role: "" }, "referee", "view")).toBe(false);
  });

  it("unions permissions across multiple roles", () => {
    const user = { role: "refereeAdmin,venueManager" };
    expect(can(user, "referee", "delete")).toBe(true); // from refereeAdmin
    expect(can(user, "venue", "delete")).toBe(true);   // from venueManager
    expect(can(user, "settings", "update")).toBe(false); // neither grants
  });

  it("ignores unknown roles when checking permissions", () => {
    const user = { role: "garbage,refereeAdmin" };
    expect(can(user, "referee", "delete")).toBe(true);
  });
});

describe("canAll", () => {
  it("returns true only if every permission holds", () => {
    const user = { role: "refereeAdmin" };
    expect(
      canAll(user, { referee: ["view", "update"], assignment: ["claim"] }),
    ).toBe(true);
    expect(
      canAll(user, { referee: ["view"], venue: ["view"] }),
    ).toBe(false);
  });

  it("returns false for null user", () => {
    expect(canAll(null, { referee: ["view"] })).toBe(false);
  });
});

describe("hasRole", () => {
  it("returns true when role is in the user's roles", () => {
    expect(hasRole({ role: "admin,venueManager" }, "venueManager")).toBe(true);
  });

  it("returns false when role is not present", () => {
    expect(hasRole({ role: "venueManager" }, "admin")).toBe(false);
  });

  it("returns false for null user / null role", () => {
    expect(hasRole(null, "admin")).toBe(false);
    expect(hasRole({ role: null }, "admin")).toBe(false);
  });
});

describe("isReferee", () => {
  it("returns true when refereeId is a number", () => {
    expect(isReferee({ refereeId: 42 })).toBe(true);
  });

  it("returns false when refereeId is null, undefined, or absent", () => {
    expect(isReferee({ refereeId: null })).toBe(false);
    expect(isReferee({ refereeId: undefined })).toBe(false);
    expect(isReferee({})).toBe(false);
    expect(isReferee(null)).toBe(false);
  });
});

describe("canViewOpenGames", () => {
  it("returns true for a linked referee with no role", () => {
    expect(canViewOpenGames({ refereeId: 7, role: null })).toBe(true);
  });

  it("returns true for refereeAdmin even without a refereeId", () => {
    expect(canViewOpenGames({ refereeId: null, role: "refereeAdmin" })).toBe(true);
  });

  it("returns true for admin even without a refereeId", () => {
    expect(canViewOpenGames({ role: "admin" })).toBe(true);
  });

  it("returns false for a user with no referee link and no qualifying role", () => {
    expect(canViewOpenGames({ refereeId: null, role: "venueManager" })).toBe(false);
    expect(canViewOpenGames({ refereeId: null, role: "teamManager" })).toBe(false);
    expect(canViewOpenGames({ refereeId: null, role: null })).toBe(false);
  });

  it("returns false for null/undefined user", () => {
    expect(canViewOpenGames(null)).toBe(false);
    expect(canViewOpenGames(undefined)).toBe(false);
  });
});

describe("ROLE_NAMES catalog", () => {
  it("has exactly the four v1 roles in canonical order", () => {
    expect(ROLE_NAMES).toEqual([
      "admin",
      "refereeAdmin",
      "venueManager",
      "teamManager",
    ]);
  });
});
