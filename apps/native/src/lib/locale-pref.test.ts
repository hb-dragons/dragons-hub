import { describe, expect, it } from "vitest";
import { effectiveLocalePref } from "./locale-pref";

describe("effectiveLocalePref", () => {
  // #399: on iOS the language is set in iOS Settings, which restarts the app
  // with the chosen language as the device locale. A pref stored by the old
  // in-app picker would override that choice forever, so iOS ignores it.
  it.each(["de", "en", "system", null])("follows the system on iOS whatever is stored (%s)", (stored) => {
    expect(effectiveLocalePref(stored, "ios")).toBe("system");
  });

  it.each<[string | null, string]>([
    ["de", "de"],
    ["en", "en"],
    ["system", "system"],
    [null, "system"],
    ["fr", "system"],
  ])("keeps Android's stored pick (%s → %s)", (stored, expected) => {
    expect(effectiveLocalePref(stored, "android")).toBe(expected);
  });
});
