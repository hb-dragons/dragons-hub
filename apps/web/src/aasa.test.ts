import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// proxy.ts pulls next-intl/middleware, whose nested next/server copy trips
// vitest's resolver (see proxy.test.ts). Only the prefix list is needed here.
vi.mock("next-intl/middleware", () => ({ default: () => () => undefined }));

import { PUBLIC_PATH_PREFIXES } from "./proxy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AASA_PATH = path.join(__dirname, "../public/.well-known/apple-app-site-association");
const NEXT_CONFIG_PATH = path.join(__dirname, "../next.config.ts");
const NATIVE_APP_JSON = path.join(__dirname, "../../native/app.json");
const NATIVE_APP_DIR = path.join(__dirname, "../../native/src/app");

interface Aasa {
  applinks: { details: { appIDs: string[]; components: { "/": string; exclude?: boolean }[] }[] };
}

const aasa = JSON.parse(fs.readFileSync(AASA_PATH, "utf8")) as Aasa;
const detail = aasa.applinks.details[0]!;
const { expo } = JSON.parse(fs.readFileSync(NATIVE_APP_JSON, "utf8")) as {
  expo: { ios: { appleTeamId: string; bundleIdentifier: string } };
};

const isGroup = (segment: string): boolean => /^\(.+\)$/.test(segment);

/**
 * The app's top-level route segments, read off the expo-router file tree the
 * way `native/src/lib/nav/routes.test.ts` reads it: group directories are not
 * path segments, so they are flattened, and layouts, `index` and `+not-found`
 * name no segment of their own.
 */
function topLevelRouteSegments(dir: string): string[] {
  const found = new Set<string>();
  for (const entry of fs.readdirSync(dir)) {
    if (fs.statSync(path.join(dir, entry)).isDirectory()) {
      if (isGroup(entry)) {
        for (const nested of topLevelRouteSegments(path.join(dir, entry))) found.add(nested);
      } else {
        found.add(entry);
      }
      continue;
    }
    const name = /^(.+)\.tsx?$/.exec(entry)?.[1];
    if (!name || name === "_layout" || name === "index") continue;
    if (name.startsWith("+") || name.endsWith(".test")) continue;
    found.add(name);
  }
  return [...found];
}

/** The app's top-level segments, as web paths. */
const NATIVE_PREFIXES = topLevelRouteSegments(NATIVE_APP_DIR).map((segment) => `/${segment}`);

/**
 * What the file has to claim: every prefix that is public on the web *and*
 * routable in the app. Derived rather than listed (#251), so a native route
 * that gains or loses a public web counterpart fails the build instead of
 * drifting away from the claims silently.
 */
const EXPECTED_CLAIMS = NATIVE_PREFIXES.filter((prefix) =>
  PUBLIC_PATH_PREFIXES.includes(prefix),
).sort();

/** What it does claim, as prefixes: `/schedule*` and `/team/*` both name one. */
const ACTUAL_CLAIMS = [
  ...new Set(
    detail.components
      .filter((component) => !component.exclude)
      .map((component) => `/${component["/"].split("/")[1]!.replace(/\*$/, "")}`),
  ),
].sort();

/**
 * Universal links (#217/#248): the entitlement in the binary is inert until
 * this file is served on app.hbdragons.de. The appID must name the Apple
 * team the binary is signed with, so it is read from the native config
 * rather than typed twice — the team conversion (#246) keeps the id, but a
 * fallback enrollment would not.
 */
describe("apple-app-site-association", () => {
  it("names the team and bundle id the native binary is built with", () => {
    expect(detail.appIDs).toEqual([`${expo.ios.appleTeamId}.${expo.ios.bundleIdentifier}`]);
  });

  it("read the native route tree", () => {
    // Guards the two assertions below against a moved app directory, which
    // would otherwise leave them comparing two empty sets.
    expect(NATIVE_PREFIXES.length).toBeGreaterThan(5);
    expect(EXPECTED_CLAIMS.length).toBeGreaterThan(0);
  });

  // Both directions in one assertion: a prefix that is public on the web and
  // routable in the app but unclaimed fails, and so does a claim with no
  // native route behind it.
  it("claims exactly the public web prefixes that have a native screen", () => {
    expect(ACTUAL_CLAIMS).toEqual(EXPECTED_CLAIMS);
  });

  it("leaves the English locale prefix and session-gated surfaces to the browser", () => {
    const excluded = detail.components.filter((c) => c.exclude).map((c) => c["/"]);
    expect(excluded).toEqual(expect.arrayContaining(["/en/*", "/admin/*", "/profile"]));
    // Exclusions must come first: Apple evaluates components in order.
    const firstClaim = detail.components.findIndex((c) => !c.exclude);
    const lastExclude = detail.components.map((c) => Boolean(c.exclude)).lastIndexOf(true);
    expect(lastExclude).toBeLessThan(firstClaim);
  });

  it("is served as application/json (Next.js would otherwise send octet-stream for an extension-less file)", () => {
    const config = fs.readFileSync(NEXT_CONFIG_PATH, "utf8");
    const rule = /source:\s*"\/\.well-known\/apple-app-site-association"[\s\S]*?value:\s*"application\/json"/;
    expect(config).toMatch(rule);
  });
});
