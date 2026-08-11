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
  expo: { ios?: { deploymentTarget?: string } };
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
