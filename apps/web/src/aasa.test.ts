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

interface Aasa {
  applinks: { details: { appIDs: string[]; components: { "/": string; exclude?: boolean }[] }[] };
}

const aasa = JSON.parse(fs.readFileSync(AASA_PATH, "utf8")) as Aasa;
const detail = aasa.applinks.details[0]!;
const { expo } = JSON.parse(fs.readFileSync(NATIVE_APP_JSON, "utf8")) as {
  expo: { ios: { appleTeamId: string; bundleIdentifier: string } };
};

/** Web prefixes that have a screen in the native app (`lib/nav/href.ts`). */
const APP_ROUTED_PREFIXES = ["/schedule", "/standings", "/teams", "/team", "/game", "/h2h"];

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

  it("claims every public web prefix that has a native screen", () => {
    for (const prefix of APP_ROUTED_PREFIXES) {
      expect(PUBLIC_PATH_PREFIXES, `${prefix} is no longer public on the web`).toContain(prefix);
      const claimed = detail.components.some((c) => !c.exclude && c["/"].startsWith(prefix));
      expect(claimed, `${prefix} is not claimed`).toBe(true);
    }
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
