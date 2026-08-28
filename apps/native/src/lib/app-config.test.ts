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
        NSPrivacyCollectedDataTypes?: {
          NSPrivacyCollectedDataType: string;
          NSPrivacyCollectedDataTypeLinked: boolean;
          NSPrivacyCollectedDataTypeTracking: boolean;
          NSPrivacyCollectedDataTypePurposes: string[];
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
 *
 * @sentry/react-native (#238) adds no new category: sentry-cocoa declares
 * UserDefaults CA92.1, SystemBootTime 35F9.1 and FileTimestamp C617.1, all
 * three of which the list below already carries. It ships its manifest only
 * in the dynamic framework, and this app builds static pods, which is the
 * case Apple mis-parses — so the app-level declaration is what counts.
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
    const strings = JSON.parse(readFileSync(file, "utf8")) as {
      ios?: Record<string, string>;
    };
    expect(strings.ios?.NSFaceIDUsageDescription).toMatch(/\S/);
  });

  // Prebuild copies unscoped top-level keys into BOTH platforms, so a bare
  // iOS key lands in Android's strings.xml with no default-locale entry and
  // `lintVitalRelease` fails the release build with a fatal ExtraTranslation.
  it.each(APP_LANGUAGES)("%s scopes every key to a platform", (lang) => {
    const file = path.resolve(path.dirname(APP_JSON), expo.locales?.[lang] ?? "");
    const strings = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    for (const key of Object.keys(strings)) {
      expect(["ios", "android"]).toContain(key);
    }
  });

  it("allows mixed localizations so iOS picks the translated strings", () => {
    expect(expo.ios?.infoPlist?.CFBundleAllowMixedLocalizations).toBe(true);
  });
});

/**
 * What the binary sends off-device, declared for Apple. Crash reporting is
 * the only collection the app does (#238): GlitchTip receives the exception,
 * its stack and the breadcrumbs that led there. Performance data is not
 * listed because tracing is off (`lib/crash-reporting/options.ts`), and
 * nothing here is linked to a user or used for tracking.
 *
 * This has to agree with the App Store Connect privacy label and with § 11.8
 * of the Datenschutzerklärung; all three are edited together.
 */
const COLLECTED_DATA_TYPES = [
  "NSPrivacyCollectedDataTypeCrashData",
  "NSPrivacyCollectedDataTypeOtherDiagnosticData",
];

describe("app.json collected data types", () => {
  const collected = expo.ios?.privacyManifests?.NSPrivacyCollectedDataTypes;

  it("declares exactly the diagnostic types crash reporting sends", () => {
    expect(collected?.map((entry) => entry.NSPrivacyCollectedDataType)).toEqual(
      COLLECTED_DATA_TYPES,
    );
  });

  it.each(COLLECTED_DATA_TYPES)("declares %s as unlinked, untracked and app-functional", (type) => {
    const entry = collected?.find((candidate) => candidate.NSPrivacyCollectedDataType === type);

    expect(entry?.NSPrivacyCollectedDataTypeLinked).toBe(false);
    expect(entry?.NSPrivacyCollectedDataTypeTracking).toBe(false);
    expect(entry?.NSPrivacyCollectedDataTypePurposes).toEqual([
      "NSPrivacyCollectedDataTypePurposeAppFunctionality",
    ]);
  });
});

/**
 * Crash-reporting credentials must not be committed (#238). The DSN and the
 * sentry-cli auth token are EAS environment variables in the `preview` and
 * `production` environments; the org and project slugs are not secrets and do
 * live in `app.json`. A DSN pasted into a build profile's `env` block would
 * work, which is exactly why nothing would notice it.
 */
const EAS_JSON = path.resolve(path.dirname(APP_JSON), "eas.json");

describe("crash-reporting configuration", () => {
  const easJson = readFileSync(EAS_JSON, "utf8");

  it("keeps the DSN and the auth token out of the repo", () => {
    const committed = `${easJson}\n${readFileSync(APP_JSON, "utf8")}`;

    // A GlitchTip/Sentry DSN is `https://<32 hex>@<host>/<project id>`.
    expect(committed).not.toMatch(/https:\/\/[0-9a-f]{16,}@/i);
    expect(committed).not.toContain("SENTRY_AUTH_TOKEN");
  });

  // Left unset, EAS derives the environment from the profile, and `preview`
  // — which is `distribution: "store"` — resolves to `production`. The two
  // would then share one set of variables.
  it("pins every build profile to its own EAS environment", () => {
    const { build } = JSON.parse(easJson) as {
      build: Record<string, { environment?: string }>;
    };

    expect(build.development?.environment).toBe("development");
    expect(build.preview?.environment).toBe("preview");
    expect(build.production?.environment).toBe("production");
  });
});

/**
 * Metro's Sentry wiring (#238). Two spellings exist and only one works on
 * Expo: `getSentryExpoConfig` passes a debug-id plugin into Expo's own
 * `getDefaultConfig`, while `withSentryConfig` installs a custom serializer
 * wrapping Metro's — the bare React Native path. Against Expo's serializer
 * that one reads `undefined` for the bundle source and fails the build with
 * "Cannot read properties of undefined (reading 'match')", during
 * `expo export:embed`, which on EAS reads as a plain bundling failure.
 *
 * Asserted as source text because the plugin is consumed inside
 * `getDefaultConfig` and never surfaces on the returned config object, so
 * there is nothing to inspect at runtime.
 */
const METRO_CONFIG = path.resolve(path.dirname(APP_JSON), "metro.config.js");

describe("metro Sentry wiring", () => {
  const metroConfig = readFileSync(METRO_CONFIG, "utf8");

  it("builds the config with getSentryExpoConfig", () => {
    expect(metroConfig).toContain("getSentryExpoConfig");
  });

  it("does not wrap Metro's serializer with the bare-RN helper", () => {
    expect(metroConfig).not.toMatch(/\bwithSentryConfig\s*\(/);
  });
});
