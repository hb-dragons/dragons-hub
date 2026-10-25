import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIN_TAP_TARGET, filterPillA11y, pagerTabA11y, tapTargetSlop } from "@/lib/ui/a11y";
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

describe("pagerTabA11y", () => {
  it("announces the column on screen as a selected tab", () => {
    expect(pagerTabA11y("To do, 3 tasks", true)).toEqual({
      accessibilityRole: "tab",
      accessibilityLabel: "To do, 3 tasks",
      accessibilityState: { selected: true },
    });
  });

  it("carries selected: false for the other columns", () => {
    expect(pagerTabA11y("Done", false).accessibilityState).toEqual({ selected: false });
  });

  it("is what the board's column pills use", () => {
    const source = readFileSync(resolveInPackage("src/components/board/BoardHeader.tsx"), "utf8");
    expect(source).toContain("pagerTabA11y(");
  });
});

describe("tapTargetSlop", () => {
  it("grows a small square evenly to the minimum on both axes", () => {
    expect(tapTargetSlop(32)).toEqual({ top: 6, bottom: 6, left: 6, right: 6 });
  });

  it("grows each axis on its own", () => {
    expect(tapTargetSlop(44, 18)).toEqual({ top: 13, bottom: 13, left: 0, right: 0 });
  });

  it("rounds up, so an odd gap never leaves the target a point short", () => {
    const slop = tapTargetSlop(19);
    expect(19 + slop.left + slop.right).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
  });

  it("adds nothing to a control already at or above the minimum", () => {
    expect(tapTargetSlop(60, 48)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});
