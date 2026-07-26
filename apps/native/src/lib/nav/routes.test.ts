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

describe("expo-router route tree", () => {
  it("was actually found", () => {
    expect(FILES.length).toBeGreaterThan(5);
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

  it("treats every session-gated screen as non-public", () => {
    for (const link of ["/officiating", "/today", "/referee-game/1", "/profile", "/admin/boards", "/assistant"]) {
      expect(isPublicDeepLink(link), `${link} must require a session`).toBe(false);
    }
  });
});
