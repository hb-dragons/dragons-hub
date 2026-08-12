import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterPillA11y } from "@/lib/ui/a11y";
import { resolveInPackage } from "../../../test/source-tree";

describe("filterPillA11y", () => {
  it("announces a pill that is on as selected", () => {
    expect(filterPillA11y("Home games", true)).toEqual({
      accessibilityRole: "button",
      accessibilityLabel: "Home games",
      accessibilityState: { selected: true },
    });
  });

  it("announces a pill that is off as not selected, rather than omitting the state", () => {
    // `selected: false` is the point: VoiceOver reads the trait only when the
    // key is present, so dropping it for inactive pills would leave the user
    // unable to tell an unselected filter from one with no state at all.
    expect(filterPillA11y("Away games", false)).toEqual({
      accessibilityRole: "button",
      accessibilityLabel: "Away games",
      accessibilityState: { selected: false },
    });
  });

  it("passes the caller's label through untouched", () => {
    expect(filterPillA11y("Fällig bald", false).accessibilityLabel).toBe("Fällig bald");
  });
});

describe("filter pill components", () => {
  // The app has no component-render seam, so this reads the source instead:
  // both pill families must take their selected state from one place, or the
  // next pill added quietly ships without it.
  it.each([
    "src/components/FilterPill.tsx",
    "src/components/board/FilterChips.tsx",
  ])("%s builds its pill accessibility with filterPillA11y", (file) => {
    const source = readFileSync(resolveInPackage(file), "utf8");
    expect(source).toContain("filterPillA11y(");
    expect(source).not.toContain("accessibilityState=");
  });
});
