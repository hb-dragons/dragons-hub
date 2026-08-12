import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Invariants of `app.json` that are easy to drop by accident and expensive to
 * discover — a wrong native build floor only shows up in a cloud build or,
 * worse, in a store rejection.
 */

const APP_JSON = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../app.json",
);

const { expo } = JSON.parse(readFileSync(APP_JSON, "utf8")) as {
  expo: {
    ios?: { deploymentTarget?: string; associatedDomains?: string[] };
    android?: {
      intentFilters?: {
        autoVerify?: boolean;
        data?: { scheme?: string; host?: string }[];
      }[];
    };
  };
};

/**
 * The floor Expo SDK 57 supports, from `EXPO_SDK_MINIMAL_SUPPORTED_VERSIONS`
 * in expo-build-properties. Re-read it on every SDK upgrade: prebuild silently
 * applies the SDK's own default when nothing is pinned, so the day this drifts
 * is the day the pin stops describing the build.
 */
const SDK_57_MIN_IOS_DEPLOYMENT_TARGET = "16.4";

describe("app.json iOS build config", () => {
  it("pins the iOS deployment target at the floor the installed SDK supports", () => {
    expect(expo.ios?.deploymentTarget).toBe(SDK_57_MIN_IOS_DEPLOYMENT_TARGET);
  });
});

/**
 * Universal links (#217). The entitlement is half of the handshake — the other
 * half is `/.well-known/apple-app-site-association` on the same origin, served
 * by the web property (companion ticket). Without the entitlement iOS never
 * asks for that file and every club link opens in Safari instead of the app,
 * and the mistake is invisible until someone taps a link on a device build.
 */
const APPLINKS_PREFIX = "applinks:";

/** Hosts the Android manifest claims for `https` links, in declaration order. */
const androidHttpsHosts = (expo.android?.intentFilters ?? []).flatMap((filter) =>
  (filter.data ?? [])
    .filter((entry) => entry.scheme === "https" && entry.host)
    .map((entry) => entry.host!),
);

describe("app.json universal links", () => {
  it("declares an associated-domains entitlement", () => {
    expect(expo.ios?.associatedDomains ?? []).not.toHaveLength(0);
  });

  it("claims the same https hosts on iOS as Android already verifies", () => {
    const iosHosts = (expo.ios?.associatedDomains ?? [])
      .filter((domain) => domain.startsWith(APPLINKS_PREFIX))
      .map((domain) => domain.slice(APPLINKS_PREFIX.length));
    // One origin, declared twice because the two platforms spell it
    // differently. A host added to one and not the other is a link that opens
    // the app on one phone and the browser on the other.
    expect([...iosHosts].sort()).toEqual([...androidHttpsHosts].sort());
  });
});
