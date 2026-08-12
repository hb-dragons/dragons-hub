import { describe, expect, it } from "vitest";

import { APP_ROUTES, NOT_FOUND_ROUTE, linkSegments, resolveDeepLink } from "@/lib/nav/href";

// The deep-link auth gate reads a path through this too, so the two agree by
// construction about which segment is the first one — the segment the gate
// decides on.
describe("linkSegments", () => {
  it.each([
    ["/schedule", ["schedule"]],
    ["/game/55/", ["game", "55"]],
    ["/(tabs)/schedule", ["schedule"]],
    ["/(auth)/sign-in", ["sign-in"]],
    ["/game/55?from=push", ["game", "55"]],
    ["/schedule#top", ["schedule"]],
    ["/", []],
  ])("splits %j", (link, expected) => {
    expect(linkSegments(link)).toEqual(expected);
  });
});

describe("resolveDeepLink", () => {
  it.each([
    ["/", "/"],
    ["/schedule", "/schedule"],
    ["/game/55", "/game/55"],
    ["/team/3", "/team/3"],
    ["/h2h/9", "/h2h/9"],
    ["/referee-game/7", "/referee-game/7"],
    ["/admin/boards", "/admin/boards"],
    ["/admin/boards/12", "/admin/boards/12"],
    ["/league-tables", "/league-tables"],
  ])("resolves %s to the route that backs it", (link, expected) => {
    expect(resolveDeepLink(link)).toBe(expected);
  });

  it("treats route-group segments as transparent", () => {
    expect(resolveDeepLink("/(tabs)/schedule")).toBe("/schedule");
    expect(resolveDeepLink("/(auth)/sign-in")).toBe("/sign-in");
  });

  it("tolerates a trailing slash", () => {
    expect(resolveDeepLink("/schedule/")).toBe("/schedule");
  });

  it.each([
    ["/nope"],
    ["/game"],
    ["/game/55/box-score"],
    ["/admin"],
    ["/admin/boards/12/tasks"],
    [""],
    ["   "],
    ["schedule"],
    ["//app.hbdragons.de/schedule"],
    ["https://evil.example/game/55"],
    ["/../game/55"],
  ])("refuses to resolve %j", (link) => {
    expect(resolveDeepLink(link)).toBeNull();
  });

  // No screen reads search params (every route reads its id off the path), and
  // no notification the API sends carries one. Carrying a suffix through would
  // mean concatenating an unchecked string onto a typed href, which is the
  // hole this module exists to close — so the path is what resolves, and a
  // suffix is dropped rather than silently defeating the type.
  it("drops a query string or hash rather than concatenating it back on", () => {
    expect(resolveDeepLink("/game/55?from=push")).toBe("/game/55");
    expect(resolveDeepLink("/schedule#top")).toBe("/schedule");
  });

  it("resolves the fallback route it hands unmatched links to", () => {
    expect(resolveDeepLink(NOT_FOUND_ROUTE)).toBe(NOT_FOUND_ROUTE);
  });

  it("keeps a dynamic segment's value verbatim", () => {
    expect(resolveDeepLink("/game/not-a-number")).toBe("/game/not-a-number");
  });

  // Every declared route has to survive the round trip, or it is a screen no
  // link can open. `routes.test.ts` pins the table to the files on disk; this
  // pins each entry to a path the resolver actually matches.
  it("round-trips every route it declares", () => {
    expect(Object.keys(APP_ROUTES).length).toBeGreaterThan(10);
    for (const pattern of Object.keys(APP_ROUTES)) {
      const link = pattern.replace(/\[[^\]]+\]/g, "42");
      expect(resolveDeepLink(link), pattern).toBe(link);
    }
  });
});
