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
    ios?: {
      deploymentTarget?: string;
      associatedDomains?: string[];
      infoPlist?: Record<string, unknown>;
      privacyManifests?: {
        NSPrivacyTracking?: boolean;
        NSPrivacyAccessedAPITypes?: {
          NSPrivacyAccessedAPIType: string;
          NSPrivacyAccessedAPITypeReasons: string[];
        }[];
      };
    };
    android?: {
      intentFilters?: {
        autoVerify?: boolean;
        data?: { scheme?: string; host?: string }[];
      }[];
    };
    locales?: Record<string, string>;
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

/**
 * Apple's required-reason APIs (App Store review since May 2024). The prebuild
 * template writes no app-level manifest, and Apple mis-parses manifests inside
 * static pods, so the app declares the union of what its dependencies use.
 * The installed manifests are react-native, async-storage, expo-constants,
 * expo-device, expo-localization, expo-notifications, expo-file-system
 * (DiskSpace + FileTimestamp) and expo-application (whose categories are
 * already covered) — verified in node_modules on 2026-08-25. Re-check the
 * union after adding a native dependency, and read the ITMS-91053 mail after
 * every first upload of a new build.
 */
const REQUIRED_REASON_APIS: [type: string, reasons: string[]][] = [
  ["NSPrivacyAccessedAPICategoryUserDefaults", ["CA92.1"]],
  ["NSPrivacyAccessedAPICategoryFileTimestamp", ["C617.1"]],
  ["NSPrivacyAccessedAPICategorySystemBootTime", ["35F9.1"]],
  ["NSPrivacyAccessedAPICategoryDiskSpace", ["85F4.1", "E174.1"]],
];

describe("app.json privacy manifest", () => {
  const manifest = expo.ios?.privacyManifests;

  it("declares that the app does not track", () => {
    expect(manifest?.NSPrivacyTracking).toBe(false);
  });

  it.each(REQUIRED_REASON_APIS)(
    "declares %s with reasons %s",
    (type, reasons) => {
      const entry = manifest?.NSPrivacyAccessedAPITypes?.find(
        (candidate) => candidate.NSPrivacyAccessedAPIType === type,
      );
      expect(entry?.NSPrivacyAccessedAPITypeReasons).toEqual(reasons);
    },
  );
});

/**
 * The runtime is de + en (`src/lib/i18n.ts`), but a binary that declares only
 * its development region is English-only to iOS Settings, the store's
 * "Languages" row and the Face ID prompt. `locales` writes one
 * `InfoPlist.strings` per language at prebuild.
 */
const APP_LANGUAGES = ["de", "en"];

describe("app.json locales", () => {
  it("declares the runtime's two languages", () => {
    expect(Object.keys(expo.locales ?? {}).sort()).toEqual(APP_LANGUAGES);
  });

  it.each(APP_LANGUAGES)("%s translates the Face ID prompt", (lang) => {
    const file = path.resolve(path.dirname(APP_JSON), expo.locales?.[lang] ?? "");
    const strings = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
    expect(strings.NSFaceIDUsageDescription).toMatch(/\S/);
  });

  it("allows mixed localizations so iOS picks the translated strings", () => {
    expect(expo.ios?.infoPlist?.CFBundleAllowMixedLocalizations).toBe(true);
  });
});
