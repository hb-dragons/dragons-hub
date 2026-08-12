import { describe, expect, it } from "vitest";
import de from "@/i18n/de.json";
import en from "@/i18n/en.json";
import { LOCALE_SEGMENTS, THEME_SEGMENTS, segmentLabels } from "@/lib/ui/preference-segments";
import { lookup } from "../../../test/i18n-bundles";

describe("preference segments", () => {
  // The order is the control's reading order, and "system" first is what makes
  // the default the leftmost segment rather than something to hunt for.
  it("offers the theme modes in the order the control draws them", () => {
    expect(THEME_SEGMENTS.map((s) => s.key)).toEqual(["system", "light", "dark"]);
  });

  it("offers the locale preferences in the order the control draws them", () => {
    expect(LOCALE_SEGMENTS.map((s) => s.key)).toEqual(["system", "de", "en"]);
  });

  it.each([...THEME_SEGMENTS, ...LOCALE_SEGMENTS])(
    "localizes $key in both bundles",
    ({ labelKey }) => {
      expect(typeof lookup(en, labelKey), `${labelKey} missing from en`).toBe("string");
      expect(typeof lookup(de, labelKey), `${labelKey} missing from de`).toBe("string");
    },
  );
});

describe("segmentLabels", () => {
  it("translates each label in place, keeping the declared order", () => {
    expect(segmentLabels(THEME_SEGMENTS, (key) => `t:${key}`)).toEqual([
      { key: "system", label: "t:profile.themeSystem" },
      { key: "light", label: "t:profile.themeLight" },
      { key: "dark", label: "t:profile.themeDark" },
    ]);
  });
});
