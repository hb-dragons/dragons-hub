import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

// handler.ts imports expo-notifications at module scope; the real module needs
// a React Native runtime (`__DEV__`) that this node-environment suite has not.
vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(),
  getLastNotificationResponseAsync: vi.fn(),
}));

import { SIGNED_OUT_FALLBACK, isPublicDeepLink } from "@/lib/push/handler";
import { STANDINGS_SHORTCUT_ROUTE } from "@/lib/nav/tabs";
import { APP_ROUTES } from "@/lib/nav/href";

/**
 * Keeps the deep-link gate honest against the real expo-router file tree:
 * every destination `handler.ts` can send a user to has to be a screen that
 * actually exists, and an unmatched link has to have somewhere to land.
 */

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app");

function routeFiles(dir: string, prefix: string[] = []): string[][] {
  const found: string[][] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...routeFiles(full, [...prefix, entry]));
      continue;
    }
    const match = /^(.+)\.(?:tsx|ts)$/.exec(entry);
    if (!match || match[1]!.endsWith(".test")) continue;
    found.push([...prefix, match[1]!]);
  }
  return found;
}

const FILES = routeFiles(APP_DIR);
const isGroup = (s: string): boolean => /^\(.+\)$/.test(s);

/** Route paths with group segments stripped, e.g. "(tabs)/today" -> "/today". */
const ROUTE_PATHS = new Set(
  FILES.map((segments) => (segments.at(-1) === "index" ? segments.slice(0, -1) : segments))
    .map((segments) => "/" + segments.filter((s) => !isGroup(s)).join("/")),
);

/**
 * The same route paths, spelled the way expo-router names them: layouts are
 * not routes, `index` is its directory, and a dynamic segment keeps its
 * brackets (`/game/[id]`).
 */
const ROUTE_PATTERNS = FILES.filter((segments) => segments.at(-1) !== "_layout")
  .map((segments) => (segments.at(-1) === "index" ? segments.slice(0, -1) : segments))
  .map((segments) => "/" + segments.filter((s) => !isGroup(s)).join("/"));

describe("expo-router route tree", () => {
  it("was actually found", () => {
    expect(FILES.length).toBeGreaterThan(5);
  });

  // `APP_ROUTES` is what turns a runtime path into a typed href, so a screen
  // missing from it is a screen no deep link can reach, and an entry with no
  // file behind it is a link that resolves to `+not-found` at runtime while
  // typechecking clean. Both directions, one assertion.
  it("matches the typed-href route table one for one", () => {
    expect(Object.keys(APP_ROUTES).sort()).toEqual([...ROUTE_PATTERNS].sort());
  });

  it("declares a +not-found route so unmatched deep links degrade gracefully", () => {
    expect(FILES.map((segments) => segments.at(-1))).toContain("+not-found");
  });

  it("declares the screen a signed-out deep-link tap is redirected to", () => {
    const stripped = "/" + SIGNED_OUT_FALLBACK.split("/").filter((s) => s && !isGroup(s)).join("/");
    expect(ROUTE_PATHS).toContain(stripped);
  });

  it("only treats real routes as publicly reachable", () => {
    for (const route of ROUTE_PATHS) {
      if (!isPublicDeepLink(route)) continue;
      expect(ROUTE_PATHS).toContain(route);
    }
    // Every screen the gate calls public must exist as a file.
    for (const link of ["/", "/schedule", "/standings", "/teams", "/game/1", "/team/1", "/h2h/1"]) {
      expect(isPublicDeepLink(link)).toBe(true);
      const asRoute = link === "/" ? "/" : "/" + link.split("/")[1]!;
      const exists = [...ROUTE_PATHS].some(
        (r) => r === asRoute || r.startsWith(asRoute === "/" ? "/" : asRoute + "/"),
      );
      expect(exists, `${link} is treated as public but no route file backs it`).toBe(true);
    }
  });

  it("backs the Staff standings shortcut with a route outside the tab group", () => {
    const file = FILES.find(
      (segments) => "/" + segments.filter((s) => !isGroup(s)).join("/") === STANDINGS_SHORTCUT_ROUTE,
    );
    expect(file, `no route file backs ${STANDINGS_SHORTCUT_ROUTE}`).toBeDefined();
    // A route inside (tabs) is mounted only while its own trigger renders, so
    // it would be missing for the very users the shortcut exists for.
    expect(file).not.toContain("(tabs)");
  });

  it("treats every session-gated screen as non-public", () => {
    for (const link of ["/officiating", "/today", "/referee-game/1", "/profile", "/admin/boards", "/assistant", "/referee-assign"]) {
      expect(isPublicDeepLink(link), `${link} must require a session`).toBe(false);
    }
  });
});
