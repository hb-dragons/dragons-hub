import { describe, expect, it } from "vitest";
import { lockLabels, lockMethod, type LockMethod } from "./lock-method";

// expo-local-authentication's AuthenticationType values, spelled out so this
// test does not load the native module.
const FINGERPRINT = 1;
const FACIAL_RECOGNITION = 2;
const IRIS = 3;

describe("lockMethod", () => {
  it.each<[string, number[], LockMethod]>([
    ["Face ID", [FACIAL_RECOGNITION], "faceId"],
    ["Touch ID", [FINGERPRINT], "touchId"],
    ["an unknown sensor", [IRIS], "biometrics"],
  ])("names %s on iOS", (_name, types, expected) => {
    expect(lockMethod(types, "ios")).toBe(expected);
  });

  it.each<[string, number[], LockMethod]>([
    ["a fingerprint sensor", [FINGERPRINT], "fingerprint"],
    ["face unlock", [FACIAL_RECOGNITION], "face"],
    ["an iris scanner", [IRIS], "iris"],
    // The system prompt lets the user pick, so naming one would be wrong.
    ["more than one method", [FINGERPRINT, FACIAL_RECOGNITION], "biometrics"],
  ])("names %s on Android", (_name, types, expected) => {
    expect(lockMethod(types, "android")).toBe(expected);
  });

  it("returns null when the device reports no method", () => {
    expect(lockMethod([], "ios")).toBeNull();
    expect(lockMethod([], "android")).toBeNull();
  });

  it("ignores a repeated type", () => {
    expect(lockMethod([FINGERPRINT, FINGERPRINT], "android")).toBe("fingerprint");
  });
});

describe("lockLabels", () => {
  const t = (key: string, options?: Record<string, string>) =>
    options ? `${key}(${Object.values(options).join(",")})` : key;

  it("names the method on the toggle and on the unlock button", () => {
    expect(lockLabels("faceId", t)).toEqual({
      toggle: "profile.lockWith(lockMethod.faceId)",
      unlock: "auth.unlockWith(lockMethod.faceId)",
    });
  });

  it("falls back to the generic wording before the method is known", () => {
    expect(lockLabels(null, t)).toEqual({
      toggle: "profile.lockWith(lockMethod.biometrics)",
      unlock: "auth.unlockWith(lockMethod.biometrics)",
    });
  });
});
